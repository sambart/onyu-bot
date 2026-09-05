import { InjectDiscordClient, On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService, type NewbieConfigDto } from '@onyu/bot-api-client';
import type { SendableChannels } from 'discord.js';
import { AttachmentBuilder, Client, EmbedBuilder, type GuildMember } from 'discord.js';

import {
  buildMissionVars,
  MISSION_VAR_NAMES,
  stripUnfilledMissionLines,
  toOptionalText,
} from './welcome-template.util';

/** 환영인사 Canvas 카드 첨부파일 고정 파일명 — best-friend.command.ts:186 관례 */
const WELCOME_CARD_ATTACHMENT_NAME = 'welcome-card.png';

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

    // 1. API에서 설정 조회 (getNewbieConfig는 내부에서 실패를 흡수하고 null을 반환한다)
    const config: NewbieConfigDto | null = await this.apiClient.getNewbieConfig(guildId);
    if (!config) return;

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

      const vars: Record<string, string> = {
        username: member.displayName,
        mention: `<@${member.id}>`,
        memberCount: String(member.guild.memberCount),
        serverName: member.guild.name,
        // F-NEWBIE-009 — 미션 안내 변수 4개(빈 문자열 치환 규칙은 buildMissionVars 참조)
        ...buildMissionVars(config),
      };
      // F1(review-575-followup §2-1 C) — 전처리 결과가 공백뿐이면 content 자체를 생략한다
      // (빈 content 필드를 굳이 실어 보내지 않는다).
      const content = config.welcomeContent
        ? toOptionalText(this.applyWelcomeTemplate(config.welcomeContent, vars))
        : undefined;

      if (config.welcomeDisplayMode === 'CANVAS') {
        const sent = await this.sendWelcomeCanvas(channel, member, content);
        if (sent) return;
        // 재시도 없음 — 즉시 EMBED 강등(TC-02-06/TC-02-10)
      }

      await this.sendWelcomeEmbed(channel, member, config, content, vars);
    } catch (err) {
      this.logger.error(
        `[BOT] Welcome message failed: guild=${member.guild.id} member=${member.id}`,
        err instanceof Error ? err.stack : err,
      );
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
   */
  private async sendWelcomeEmbed(
    channel: SendableChannels,
    member: GuildMember,
    config: NewbieConfigDto,
    content: string | undefined,
    vars: Record<string, string>,
  ): Promise<void> {
    let embed: EmbedBuilder;
    try {
      embed = this.buildWelcomeEmbed(config, member, vars);
    } catch (err) {
      this.logger.warn(
        `[BOT] Welcome embed 조립 실패 → content-only 폴백 시도: guild=${member.guild.id} member=${member.id}`,
        err instanceof Error ? err.stack : err,
      );
      if (!content) return; // 폴백 대상(content)도 없으면 현행과 동일하게 발송 없이 종료
      await channel.send({ content });
      return;
    }

    await channel.send({ content, embeds: [embed.toJSON()] });
  }

  /** sendWelcomeEmbed의 임베드 조립 전용 분리 지점 — 빌더 setter 호출은 여기서만 일어난다. */
  private buildWelcomeEmbed(
    config: NewbieConfigDto,
    member: GuildMember,
    vars: Record<string, string>,
  ): EmbedBuilder {
    const embed = new EmbedBuilder();

    const title = config.welcomeEmbedTitle
      ? toOptionalText(this.applyWelcomeTemplate(config.welcomeEmbedTitle, vars))
      : undefined;
    if (title) {
      embed.setTitle(title);
    }

    const description = config.welcomeEmbedDescription
      ? toOptionalText(this.applyWelcomeTemplate(config.welcomeEmbedDescription, vars))
      : undefined;
    if (description) {
      embed.setDescription(description);
    }

    if (config.welcomeEmbedColor) {
      embed.setColor(config.welcomeEmbedColor as `#${string}`);
    }
    if (config.welcomeEmbedThumbnailUrl) {
      embed.setThumbnail(config.welcomeEmbedThumbnailUrl);
    } else {
      embed.setThumbnail(member.displayAvatarURL({ size: 128 }));
    }

    return embed;
  }

  /**
   * F-NEWBIE-009 — 치환 직전에 미션 변수 조건부 렌더(줄 단위 전처리)를 적용한 뒤 기존
   * `applyTemplate`을 호출한다. `welcomeContent`/`welcomeEmbedTitle`/`welcomeEmbedDescription`
   * 3곳 모두 이 경로를 거친다(계획 §S1-2 적용 범위).
   */
  private applyWelcomeTemplate(template: string, vars: Record<string, string>): string {
    const preprocessed = stripUnfilledMissionLines(template, MISSION_VAR_NAMES, vars);
    return this.applyTemplate(preprocessed, vars);
  }

  private applyTemplate(template: string, vars: Record<string, string>): string {
    // replacement를 함수로 전달 — 문자열로 넘기면 user-controlled value(닉네임 등) 내부의
    // `$&`, `$$`, `$'` 같은 특수 패턴이 String.replace의 치환 메타문자로 오해석돼 메시지가 훼손된다.
    return Object.entries(vars).reduce(
      (result, [key, value]) => result.replace(new RegExp(`\\{${key}\\}`, 'g'), () => value),
      template,
    );
  }

  private async assignRole(member: GuildMember, roleId: string, guildId: string): Promise<void> {
    try {
      await member.roles.add(roleId);
      this.logger.log(`[BOT] Role assigned: guild=${guildId} member=${member.id} role=${roleId}`);

      // API에 역할 부여 사실 통보 (NewbiePeriod 레코드 생성)
      await this.apiClient.notifyRoleAssigned({ guildId, memberId: member.id });
    } catch (err) {
      this.logger.error(
        `[BOT] Role assign failed: guild=${guildId} member=${member.id} role=${roleId}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
