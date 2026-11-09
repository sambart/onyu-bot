import { InjectDiscordClient, On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import {
  type AutoActionRecordDto,
  BotApiClientService,
  getApiErrorStatus,
  type NewbieConfigDto,
} from '@onyu/bot-api-client';
import {
  applyWelcomeTemplate,
  buildWelcomeMissionVars,
  toOptionalText,
  truncateWelcomeText,
  WELCOME_TEXT_LIMITS,
} from '@onyu/shared';
import type { SendableChannels } from 'discord.js';
import {
  AttachmentBuilder,
  Client,
  EmbedBuilder,
  type GuildMember,
  PermissionFlagsBits,
} from 'discord.js';

import { lookupConfigWithRetry } from './config-lookup-retry';
import {
  buildWelcomeTextOnly,
  resolveWelcomeSendPlan,
  type WelcomeChannelPerms,
} from './welcome-send-plan';

/** 환영인사 Canvas 카드 첨부파일 고정 파일명 — best-friend.command.ts:186 관례 */
const WELCOME_CARD_ATTACHMENT_NAME = 'welcome-card.png';

/** sendWelcomeEmbed 입력 — 파라미터 수 제한(최대 3)을 지키기 위해 객체로 묶는다. */
interface SendWelcomeEmbedParams {
  channel: SendableChannels;
  member: GuildMember;
  config: NewbieConfigDto;
  content: string | undefined;
  vars: Record<string, string>;
  isTextOnly: boolean;
}

/**
 * Discord guildMemberAdd 이벤트를 수신하여 신입 온보딩을 처리한다.
 * - 환영인사: Bot에서 직접 Discord 메시지 전송 (GuildMember 필요)
 * - 미션 생성: API에 위임
 * - 역할 부여: Bot에서 직접 Discord API 호출 후 API에 통보
 */
@Injectable()
export class BotNewbieMemberAddHandler {
  private readonly logger = new Logger(BotNewbieMemberAddHandler.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    @InjectDiscordClient() private readonly discord: Client,
  ) {}

  @On('guildMemberAdd')
  async handleGuildMemberAdd(member: GuildMember): Promise<void> {
    const guildId = member.guild.id;

    // guild-member upsert (newbie 설정과 무관하게 항상 실행)
    try {
      await this.apiClient.upsertGuildMember({
        guildId,
        userId: member.id,
        displayName: member.displayName,
        username: member.user.username,
        nick: member.nickname,
        avatarUrl: member.displayAvatarURL({ size: 128 }),
        isBot: member.user.bot,
        joinedAt: member.joinedAt?.toISOString() ?? null,
      });
    } catch (err) {
      this.logger.error(
        `[BOT] guild-member upsert failed: guild=${guildId} member=${member.id}`,
        err instanceof Error ? err.stack : err,
      );
    }

    // 봇 계정은 온보딩(환영·미션·신입 역할) 대상이 아니다 — PRD newbie 참조. upsert 는 위에서 이미 수행.
    if (member.user.bot) return;

    // 1. API에서 설정 조회 — 미설정(null)은 조용히 skip, 일시 실패는 짧게 재시도 후 warn + 실패 기록
    // (감사 A5 / D3 a). SDK 가 요청 실패 로그를 이미 남기므로 여기서는 "온보딩 누락" 사실만 warn 한다.
    const lookup = await lookupConfigWithRetry<NewbieConfigDto>(() =>
      this.apiClient.getNewbieConfig(guildId),
    );
    if (lookup.status === 'none') return;
    if (lookup.status === 'failed') {
      this.handleConfigLookupFailure(member, lookup.error);
      return;
    }
    const config = lookup.config;

    // 2. 환영인사 (Bot에서 직접 Discord 메시지 전송) — 자체 try/catch 보유
    if (config.welcomeEnabled && config.welcomeChannelId) {
      await this.sendWelcomeMessage(member, config);
    }

    // P2: 3(미션 생성)과 4(역할 부여)를 개별 try/catch로 격리한다.
    // API가 실패를 rethrow(HTTP 500)하게 되었으므로, 하나의 try/catch로 묶으면
    // 미션 생성 실패가 역할 부여(step 4)까지 막는 회귀가 발생한다.

    // 3. 미션 생성 (API 호출)
    if (config.missionEnabled) {
      try {
        await this.apiClient.sendMemberJoin({
          guildId,
          memberId: member.id,
          displayName: member.displayName,
        });
      } catch (err) {
        this.logger.error(
          `[BOT] sendMemberJoin failed: guild=${guildId} member=${member.id}`,
          err instanceof Error ? err.stack : err,
        );
      }
    }

    // 4. 역할 부여 (Bot에서 직접 Discord API 호출) — 자체 try/catch 보유
    if (config.roleEnabled && config.newbieRoleId) {
      await this.assignRole(member, config.newbieRoleId, guildId);
    }
  }

  /** config 조회 최종 실패 — 온보딩 누락을 warn 하고 관리 로그용 실패 기록을 fire-and-forget 으로 남긴다. */
  private handleConfigLookupFailure(member: GuildMember, error: unknown): void {
    const status = getApiErrorStatus(error);
    this.logger.warn(
      `[BOT] newbie config 조회 실패 → 온보딩 누락: guild=${member.guild.id} member=${member.id} status=${status ?? 'none'}`,
    );
    void this.apiClient
      .recordNewbieOnboardingFailure({
        guildId: member.guild.id,
        memberId: member.id,
        kind: 'config_lookup',
      })
      .catch(() => undefined);
  }

  /**
   * 환영인사 진입점 — 채널 fetch + vars 구성 + 표시모드 분기를 담당한다.
   * F-NEWBIE-001-CANVAS: CANVAS 모드는 실패 시 재시도 없이 즉시 EMBED로 강등한다(D12) —
   * 환영 메시지 발송 자체는 어떤 경우에도 보장돼야 하는 핵심 불변식이다.
   */
  private async sendWelcomeMessage(member: GuildMember, config: NewbieConfigDto): Promise<void> {
    if (!config.welcomeChannelId) return;
    try {
      const channel = await this.discord.channels.fetch(config.welcomeChannelId).catch(() => null);
      if (!channel?.isTextBased()) return;
      // 이중 방어 — API 저장 검증을 통과한 레거시 값이라도 타 길드 채널로는 환영 메시지를 보내지 않는다
      if (channel.isDMBased() || channel.guildId !== member.guild.id) {
        this.logger.warn(
          `[channel-guild] welcome blocked: guild=${member.guild.id} channel=${config.welcomeChannelId}`,
        );
        return;
      }

      // EC-NEWBIE-53 순서 유지 — 채널 길드 소속 확인 뒤, E4 호출 전에 권한을 1회 판정한다(사후 재시도 없음).
      const perms = this.resolveChannelPerms(channel, member);
      const plan = resolveWelcomeSendPlan(perms, config.welcomeDisplayMode);
      if (plan === 'skip') {
        this.logger.warn(
          `[BOT] welcome skipped (채널 권한 부족): guild=${member.guild.id} channel=${config.welcomeChannelId}`,
        );
        this.recordWelcomeFailure(member);
        return;
      }
      const vars = this.buildWelcomeVars(member, config);
      const content = this.renderWelcomeContent(config, vars);

      if (plan === 'canvas' && (await this.sendWelcomeCanvasTracked(channel, member, content))) {
        return;
      }
      if (config.welcomeDisplayMode === 'CANVAS') {
        // 재시도 없음 — 즉시 EMBED 강등(TC-02-06/TC-02-10) 또는 AttachFiles 부재로 E4 호출 없이 강등.
        // 강등 계측은 EMBED 발송 시도 전에 남긴다 — EMBED 까지 실패하는 케이스에서도 "CANVAS 시도가
        // 실패했다"는 분자가 누락되면 안 되기 때문이다(분모=welcome-canvas-sent+welcome-canvas-fallback, 2026-09-21).
        this.recordNewbieAutoAction(member.guild.id, 'welcome-canvas-fallback');
      }

      // plan 이 canvas 인 채 E4 가 실패했다면 EMBED 기준으로 재판정한다(EmbedLinks 부재 시 텍스트-only).
      const embedPlan = plan === 'canvas' ? resolveWelcomeSendPlan(perms, 'EMBED') : plan;
      const isSent = await this.sendWelcomeEmbed({
        channel,
        member,
        config,
        content,
        vars,
        isTextOnly: embedPlan === 'text',
      });
      if (!isSent) {
        // Embed 조립 실패 + content 없음 — 실제 발송 0건이므로 welcome-sent 를 계상하지 않고 실패로 기록한다(EC-NEWBIE-121).
        this.recordWelcomeFailure(member);
        return;
      }
      // CANVAS 성공 경로는 위에서 이미 return 하므로 이중 계상 없음.
      this.recordNewbieAutoAction(member.guild.id, 'welcome-sent');
    } catch (err) {
      this.logger.error(
        `[BOT] Welcome message failed: guild=${member.guild.id} member=${member.id}`,
        err instanceof Error ? err.stack : err,
      );
      this.recordWelcomeFailure(member);
    }
  }

  /** 환영 템플릿 치환 변수 — 기본 4종 + 미션 안내 변수 4개(F-NEWBIE-009, 빈 문자열 치환 규칙은 buildWelcomeMissionVars 참조). */
  private buildWelcomeVars(member: GuildMember, config: NewbieConfigDto): Record<string, string> {
    return {
      username: member.displayName,
      mention: `<@${member.id}>`,
      memberCount: String(member.guild.memberCount),
      serverName: member.guild.name,
      ...buildWelcomeMissionVars(config),
    };
  }

  /**
   * F1(review-575-followup §2-1 C) — 전처리 결과가 공백뿐이면 content 자체를 생략한다
   * (빈 content 필드를 굳이 실어 보내지 않는다). 치환 후 길이 초과분은 잘라낸다(①-5).
   */
  private renderWelcomeContent(
    config: NewbieConfigDto,
    vars: Record<string, string>,
  ): string | undefined {
    if (!config.welcomeContent) return undefined;
    return toOptionalText(
      truncateWelcomeText(
        applyWelcomeTemplate(config.welcomeContent, vars),
        WELCOME_TEXT_LIMITS.content,
      ),
    );
  }

  /**
   * Canvas 발송 + 성공 계측 묶음. welcome-sent(총 발송, 하위호환)에 더해 welcome-canvas-sent 를 함께 적재한다 —
   * 강등률 분모(welcome-canvas-sent + welcome-canvas-fallback)를 만들기 위함(2026-09-21).
   * @returns true면 Canvas 발송 성공(호출부는 EMBED를 건너뛴다)
   */
  private async sendWelcomeCanvasTracked(
    channel: SendableChannels,
    member: GuildMember,
    content: string | undefined,
  ): Promise<boolean> {
    const isSent = await this.sendWelcomeCanvas(channel, member, content);
    if (isSent) {
      this.recordNewbieAutoAction(member.guild.id, 'welcome-sent');
      this.recordNewbieAutoAction(member.guild.id, 'welcome-canvas-sent');
    }
    return isSent;
  }

  /** F-USAGE-042 — newbie 자동 동작 계측(fire-and-forget). 실패가 원 동작을 막지 않는다(§18-10). */
  private recordNewbieAutoAction(guildId: string, action: AutoActionRecordDto['action']): void {
    void this.apiClient
      .recordAutoAction({ guildId, domain: 'newbie', action })
      .catch(() => undefined);
  }

  /**
   * F-ADMIN-LOG-006 — 관리 로그 게시(fire-and-forget). 원 동작(환영 메시지 발송)에는
   * 절대 영향을 주지 않는다(계획 §2 P4). kind 어휘는 welcome_message 를 재사용한다.
   */
  private recordWelcomeFailure(member: GuildMember): void {
    // welcome-sent 는 성공 경로에서만 계상되므로 실패 경로 호출과 이중 계상되지 않는다.
    this.recordNewbieAutoAction(member.guild.id, 'welcome-failed');
    void this.apiClient
      .recordNewbieOnboardingFailure({
        guildId: member.guild.id,
        memberId: member.id,
        kind: 'welcome_message',
      })
      .catch(() => undefined);
  }

  /**
   * 봇의 환영 채널 권한을 1회 조회한다. 조회 불가(members.me 없음 · permissionsFor 부재/null · throw)면
   * null 을 반환해 현행 경로를 유지한다(fail-open).
   */
  private resolveChannelPerms(
    channel: SendableChannels,
    member: GuildMember,
  ): WelcomeChannelPerms | null {
    if (!('permissionsFor' in channel) || typeof channel.permissionsFor !== 'function') return null;
    try {
      const me = member.guild.members.me;
      if (!me) return null;
      const perms = channel.permissionsFor(me);
      if (!perms) return null;
      const sendFlag = channel.isThread()
        ? PermissionFlagsBits.SendMessagesInThreads
        : PermissionFlagsBits.SendMessages;
      return {
        canView: perms.has(PermissionFlagsBits.ViewChannel),
        canSend: perms.has(sendFlag),
        canEmbed: perms.has(PermissionFlagsBits.EmbedLinks),
        canAttach: perms.has(PermissionFlagsBits.AttachFiles),
      };
    } catch (err) {
      this.logger.warn(
        `[BOT] welcome 권한 조회 실패 → 현행 경로: guild=${member.guild.id}`,
        err instanceof Error ? err.stack : err,
      );
      return null;
    }
  }

  /**
   * Canvas 카드 발송을 시도한다. E4 호출 실패(5xx/타임아웃/401)·빈 imageBase64·첨부 구성 실패는
   * 전부 여기서 흡수해 false를 반환한다 — 호출부가 재시도 없이 EMBED로 강등한다(D12 강등 불변식).
   * @returns true면 Canvas 발송 성공(호출부는 EMBED를 건너뛴다)
   */
  private async sendWelcomeCanvas(
    channel: SendableChannels,
    member: GuildMember,
    content: string | undefined,
  ): Promise<boolean> {
    try {
      const res = await this.apiClient.getWelcomeCard({
        guildId: member.guild.id,
        memberId: member.id,
        displayName: member.displayName,
        avatarUrl: member.displayAvatarURL({ size: 128 }),
        memberCount: member.guild.memberCount,
        serverName: member.guild.name,
      });
      if (!res.imageBase64) {
        throw new Error('welcome card render returned empty imageBase64');
      }
      const attachment = new AttachmentBuilder(Buffer.from(res.imageBase64, 'base64'), {
        name: WELCOME_CARD_ATTACHMENT_NAME,
      });

      await channel.send({ content, files: [attachment] });
      return true;
    } catch (err) {
      this.logger.warn(
        `[BOT] welcome card render failed → EMBED 강등: guild=${member.guild.id} member=${member.id}`,
        err instanceof Error ? err.stack : err,
      );
      return false;
    }
  }

  /**
   * F1(review-575-followup §2-1 C·D) — 임베드 조립(빌더 setter 호출)과 발송(channel.send)을
   * 분리한다. 제목/설명은 전처리(stripUnfilledMissionLines) 결과가 공백뿐이면 필드 자체를
   * 생략한다 — discord.js validator가 `setTitle('')`/`setDescription('')`에서 throw해
   * 발송 전체가 삼켜지던 결함(F1)의 근본 원인을 제거한다. 조립 중 그 외의 이유로 throw가
   * 나도(🔒 `setColor`/`setThumbnail` 등 인접 위험) content만이라도 발송을 시도하는
   * 방어선을 둔다 — "환영 메시지 발송은 어떤 경우에도 보장돼야 하는 핵심 불변식"(:92)을
   * 임베드 조립 실패가 다시 깨지 않도록 하기 위함이다.
   * @returns 실제로 channel.send 가 수행됐으면 true, 조립 실패 + content 없음으로 발송이 없었으면 false
   */
  private async sendWelcomeEmbed(params: SendWelcomeEmbedParams): Promise<boolean> {
    const { channel, member, config, content, vars, isTextOnly } = params;
    if (isTextOnly) {
      // EmbedLinks 부재 — 임베드 대신 텍스트 1건. 이전엔 이 상황에서 발송 자체가 실패했으므로
      // 신규 경로이며, 멘션이 동작하도록 allowedMentions 를 명시한다.
      const text = buildWelcomeTextOnly({
        content,
        title: this.renderTitle(config, vars),
        description: this.renderDescription(config, vars),
      });
      if (!text) throw new Error('welcome text-only fallback is empty');
      await channel.send({ content: text, allowedMentions: { parse: ['users', 'roles'] } });
      return true;
    }

    let embed: EmbedBuilder;
    try {
      embed = this.buildWelcomeEmbed(config, member, vars);
    } catch (err) {
      this.logger.warn(
        `[BOT] Welcome embed 조립 실패 → content-only 폴백 시도: guild=${member.guild.id} member=${member.id}`,
        err instanceof Error ? err.stack : err,
      );
      if (!content) return false; // 폴백 대상(content)도 없으면 발송 없이 종료 — 호출부가 실패로 기록한다
      await channel.send({ content });
      return true;
    }

    await channel.send({ content, embeds: [embed.toJSON()] });
    return true;
  }

  /** sendWelcomeEmbed의 임베드 조립 전용 분리 지점 — 빌더 setter 호출은 여기서만 일어난다. */
  private buildWelcomeEmbed(
    config: NewbieConfigDto,
    member: GuildMember,
    vars: Record<string, string>,
  ): EmbedBuilder {
    const embed = new EmbedBuilder();

    const title = this.renderTitle(config, vars);
    if (title) {
      embed.setTitle(title);
    }

    const description = this.renderDescription(config, vars);
    if (description) {
      embed.setDescription(description);
    }

    if (config.welcomeEmbedColor) {
      // as 사유: DTO 는 string 이지만 API 저장 검증이 #RRGGBB 형식만 통과시키므로 discord.js 의 HexColorString 으로 좁힌다.
      embed.setColor(config.welcomeEmbedColor as `#${string}`);
    }
    if (config.welcomeEmbedThumbnailUrl) {
      embed.setThumbnail(config.welcomeEmbedThumbnailUrl);
    } else {
      embed.setThumbnail(member.displayAvatarURL({ size: 128 }));
    }

    return embed;
  }

  /** 임베드 제목 렌더 — shared 치환(미션 줄 삭제 포함) 후 256 코드포인트로 잘라내고 공백뿐이면 undefined. */
  private renderTitle(config: NewbieConfigDto, vars: Record<string, string>): string | undefined {
    if (!config.welcomeEmbedTitle) return undefined;
    return toOptionalText(
      truncateWelcomeText(
        applyWelcomeTemplate(config.welcomeEmbedTitle, vars),
        WELCOME_TEXT_LIMITS.embedTitle,
      ),
    );
  }

  /** 임베드 설명 렌더 — 4096 코드포인트로 잘라낸다. */
  private renderDescription(
    config: NewbieConfigDto,
    vars: Record<string, string>,
  ): string | undefined {
    if (!config.welcomeEmbedDescription) return undefined;
    return toOptionalText(
      truncateWelcomeText(
        applyWelcomeTemplate(config.welcomeEmbedDescription, vars),
        WELCOME_TEXT_LIMITS.embedDescription,
      ),
    );
  }

  private async assignRole(member: GuildMember, roleId: string, guildId: string): Promise<void> {
    // F-ADMIN-LOG-006 — 이 try는 member.roles.add()와 notifyRoleAssigned() 둘 다 감싼다.
    // isRoleAdded가 없으면 Discord 역할은 이미 부여됐는데 notifyRoleAssigned(NewbiePeriod
    // 생성)만 실패한 경우까지 "역할 부여 실패"로 오보하게 된다(계획 §2 P4 §7 발견 5).
    let isRoleAdded = false;
    try {
      await member.roles.add(roleId);
      isRoleAdded = true;
      this.logger.log(`[BOT] Role assigned: guild=${guildId} member=${member.id} role=${roleId}`);

      // F-USAGE-042 — 자동 동작 계측(fire-and-forget). 통보(notifyRoleAssigned) 실패가
      // 이 카운트를 취소하지 않도록 통보 앞에 둔다(§18-10).
      void this.apiClient
        .recordAutoAction({ guildId, domain: 'newbie', action: 'role-assigned' })
        .catch(() => undefined);

      // API에 역할 부여 사실 통보 (NewbiePeriod 레코드 생성)
      await this.apiClient.notifyRoleAssigned({ guildId, memberId: member.id });
    } catch (err) {
      this.logger.error(
        `[BOT] Role assign failed: guild=${guildId} member=${member.id} role=${roleId}`,
        err instanceof Error ? err.stack : err,
      );
      // Discord 역할 부여 자체가 실패했을 때만 게시한다 — isRoleAdded가 true면 실패 지점은
      // notifyRoleAssigned(API 통보)뿐이고 역할은 이미 정상 부여됐으므로 오보하지 않는다.
      if (!isRoleAdded) {
        void this.apiClient
          .recordNewbieOnboardingFailure({
            guildId,
            memberId: member.id,
            kind: 'role_assignment',
          })
          .catch(() => undefined);
      }
    }
  }
}
