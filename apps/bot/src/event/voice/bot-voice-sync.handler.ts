import { InjectDiscordClient, Once } from '@discord-nestjs/core';
import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { BotApiClientService, type VoiceSyncUser } from '@onyu/bot-api-client';
import { isObfuscatedChannel } from '@onyu/shared';
import { ActivityType, ChannelType, Client, type Guild, type VoiceChannel } from 'discord.js';

import { waitForApi } from '../../common/util/wait-for-api';

/**
 * F-VOICE-117(D1-a, Q4 확정) — 주기 sync 간격(ms). API 재시작 시 존재하던 세션이 전부
 * flush 후 삭제되지만 재동기화 경로가 없어(P1-1) 조용한 체류자의 측정이 매 배포마다
 * 소실되던 결함을 고친다 — `@Once('clientReady')` 1회 실행을 최초 1회 + 5분 주기 반복으로
 * 승격한다. co-presence tick(60초)보다 훨씬 가볍고(길드당 HTTP 1회, 정상 상태에서는 API 측
 * DB 쓰기 0), API 재시작 후 측정 공백을 최대 5분으로 캡핑한다.
 */
const SYNC_INTERVAL_MS = 300_000;

/**
 * F-VOICE-135 — 은닉 판정 집계 로그 스로틀 간격(ms, 1시간). 2026-11-16 발효 전후로
 * 판정 발생 빈도를 비교하는 것이 목적이라 시간 단위 해상도면 충분하다. sync 주기
 * (`SYNC_INTERVAL_MS`)마다 매번 로깅하면 은닉 채널이 상시 점유된 길드에서 로그가 반복된다.
 */
const OBFUSCATION_LOG_THROTTLE_MS = 3_600_000;

/**
 * Discord clientReady 이벤트 수신 후 모든 길드의 음성 채널 사용자를 수집하여 API로 전송한다.
 * F-VOICE-023 3단계: 봇 재시작 시 기존 음성 채널 사용자 세션 복구.
 * F-VOICE-117: 프로세스 수명당 1회만 실행되던 것을 최초 1회 + 5분 주기 반복으로 승격한다.
 */
@Injectable()
export class BotVoiceSyncHandler implements OnApplicationShutdown {
  private readonly logger = new Logger(BotVoiceSyncHandler.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;
  private isSyncRunning = false;

  /**
   * F-VOICE-135(리뷰 후속) — 은닉 판정 집계는 "은닉이 얼마나 퍼졌는가"를 보려는 것이지
   * 인원수·이벤트 빈도에 비례해 부풀어선 안 된다. `collectGuildVoiceUsers`가 채널당
   * 멤버 수만큼 `resolveChannelName`/`resolveCategoryName`을 반복 호출하므로, 단순 카운터는
   * 채널 1개에 재적자 10명이면 10으로 뻥튀기된다 — Set으로 고유 채널/카테고리 id만 모아
   * `size`를 로깅하고, 원소(식별자)는 절대 출력하지 않는다(PRD 개별 식별자 로깅 금지).
   * 이벤트 총 횟수는 참고용 부가 필드로만 별도 유지한다.
   */
  private readonly obfuscatedChannelIds = new Set<string>();
  private readonly obfuscatedCategoryIds = new Set<string>();
  private obfuscatedChannelEvents = 0;
  private obfuscatedCategoryEvents = 0;
  private lastObfuscationLogAt = 0;

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly apiClient: BotApiClientService,
  ) {}

  @Once('clientReady')
  async handleReady(): Promise<void> {
    this.logger.log('[VOICE-SYNC] Discord ready — waiting for API...');

    // waitForApi()는 최초 1회에만 수행한다 — 주기 실행마다 재시도 대기하면 종료가 지연된다.
    const isApiReady = await waitForApi(this.apiClient);
    if (!isApiReady) {
      this.logger.error('[VOICE-SYNC] API 연결 실패 — voice sync 중단');
      return;
    }

    this.logger.log('[VOICE-SYNC] API connected — syncing existing voice channel users...');

    await this.runSync(true);

    // 종료 가드 — handleReady()는 waitForApi(최대 60초) + 최초 sync를 await하므로, 그 창 안에
    // SIGTERM이 들어오면 onApplicationShutdown()이 먼저 돌아 아직 null인 intervalId를 clear한다.
    // 가드가 없으면 여기서 "아무도 clear하지 않는" 타이머가 생겨 프로세스가 SIGKILL까지 살아남는다.
    if (this.isShuttingDown) return;

    this.intervalId = setInterval(() => void this.runSync(false), SYNC_INTERVAL_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * F-VOICE-117(D1-a, Q5 확정) — 로그 정책: 최초 실행(`isInitial=true`)은 현행 문구를 그대로
   * 유지한다(기동 확인용). 주기 실행은 **성공 시 로그 호출 자체를 두지 않는다**(debug로
   * "낮추는" 것과 다르다 — debug는 레벨 설정에 따라 되살아난다). 실패 시에만 guildId를 포함한
   * warn/error 1줄을 남긴다. 예외를 이 메서드 내부에서 흡수해 `setInterval` 콜백이
   * unhandled rejection을 남기지 않으면서도 타이머 자체는 유지되게 한다(E-17b).
   */
  private async runSync(isInitial: boolean): Promise<void> {
    if (this.isShuttingDown) return;
    if (this.isSyncRunning) {
      // 재진입 가드(`BotCoPresenceScheduler.isTickRunning`과 동일 관례) — 이 분기는 최초
      // 실행이 @Once로 1회만 호출되는 구조상 사실상 주기 실행에서만 도달한다. skip 자체는
      // "성공"이 아니라 이상 신호이므로 Q5(성공 로그 억제)의 적용 대상이 아니다.
      this.logger.warn('[VOICE-SYNC] 이전 sync 미완료 — 이번 주기 skip (API 응답 지연 의심)');
      return;
    }

    this.isSyncRunning = true;
    try {
      let totalSynced = 0;

      for (const guild of this.client.guilds.cache.values()) {
        const users = this.collectGuildVoiceUsers(guild);

        // 보낼 유저가 없으면 API가 할 일도 없다 — 좀비 정리는 sweep 담당이지 sync 담당이 아니다.
        if (users.length === 0) continue;

        totalSynced += await this.syncGuild(guild.id, users, isInitial);
      }

      if (isInitial) {
        this.logger.log(`[VOICE-SYNC] Complete — ${totalSynced} user(s) synced across all guilds`);
      }
    } catch (err) {
      // E-17b — 길드별 안쪽 try/catch가 못 잡는 예상 밖 예외(예: 캐시 순회 자체 실패)까지
      // 이 바깥 catch가 흡수해야 setInterval 콜백이 unhandled rejection을 남기지 않고
      // 타이머가 유지된다.
      this.logger.error(
        '[VOICE-SYNC] unexpected sync failure',
        err instanceof Error ? err.stack : String(err),
      );
    } finally {
      this.isSyncRunning = false;
    }
  }

  private collectGuildVoiceUsers(guild: Guild): VoiceSyncUser[] {
    const users: VoiceSyncUser[] = [];

    const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice);

    for (const channel of voiceChannels.values()) {
      if (channel.type !== ChannelType.GuildVoice) continue;

      const nonBotMembers = channel.members.filter((m) => !m.user.bot);

      for (const member of nonBotMembers.values()) {
        const voiceState = member.voice;
        const playing = member.presence?.activities?.find((a) => a.type === ActivityType.Playing);

        users.push({
          userId: member.id,
          channelId: channel.id,
          channelName: this.resolveChannelName(channel),
          parentCategoryId: channel.parentId ?? null,
          categoryName: this.resolveCategoryName(channel),
          userName: member.displayName,
          avatarUrl: member.displayAvatarURL({ size: 128 }),
          micOn: !(voiceState.selfMute ?? false) && !(voiceState.serverMute ?? false),
          streaming: voiceState.streaming ?? false,
          selfVideo: voiceState.selfVideo,
          selfDeaf: voiceState.selfDeaf,
          serverMute: voiceState.serverMute ?? false,
          serverDeaf: voiceState.serverDeaf ?? false,
          gameName: playing?.name ?? null,
          gameApplicationId: playing?.applicationId ?? null,
        });
      }
    }

    return users;
  }

  /**
   * 채널 이름을 은닉 여부에 따라 정규화한다. `VoiceSyncUser.channelName` 은
   * non-nullable `string` 이라(계약 변경 비범위) 은닉 시 `null` 대신 빈 문자열을 돌려준다 —
   * API 수신부가 어차피 `?? ''` 로 받으므로 값은 동등하게 수렴한다.
   */
  private resolveChannelName(channel: VoiceChannel): string {
    if (!isObfuscatedChannel(channel.flags?.bitfield, channel.name)) return channel.name;
    // 같은 채널이 멤버 루프 안에서 여러 번 판정돼도 Set은 채널 id 1개로만 수렴한다.
    this.obfuscatedChannelIds.add(channel.id);
    this.obfuscatedChannelEvents++;
    this.maybeLogObfuscationSummary();
    return '';
  }

  /**
   * 카테고리(부모 채널) 이름을 은닉 여부에 따라 정규화한다.
   * 채널과 카테고리는 각각 독립적으로 은닉될 수 있어(엣지 ⓐ), 채널 자체의 은닉
   * 판정 결과를 재사용하지 않고 `channel.parent` 를 별도로 판정한다.
   */
  private resolveCategoryName(channel: VoiceChannel): string | null {
    const parent = channel.parent;
    if (!parent) return null;
    if (!isObfuscatedChannel(parent.flags?.bitfield, parent.name)) return parent.name;
    // 카테고리 식별자는 이미 갖고 있는 channel.parentId를 재사용한다(parent.id 목킹 요구 회피).
    if (channel.parentId) this.obfuscatedCategoryIds.add(channel.parentId);
    this.obfuscatedCategoryEvents++;
    this.maybeLogObfuscationSummary();
    return null;
  }

  /**
   * F-VOICE-135(리뷰 후속) — 은닉 판정 발생 빈도 관측용 집계 로그. 개별 채널 식별자는
   * 절대 출력하지 않고(PRD 금지), Set의 `size`(고유 채널/카테고리 수)만 스로틀 간격마다
   * 1줄 남긴다. `channelEvents`/`categoryEvents`는 참고용 총 이벤트 수(중복 포함) 부가 필드다.
   */
  private maybeLogObfuscationSummary(): void {
    const now = Date.now();
    if (now - this.lastObfuscationLogAt < OBFUSCATION_LOG_THROTTLE_MS) return;
    if (this.obfuscatedChannelIds.size === 0 && this.obfuscatedCategoryIds.size === 0) return;

    this.logger.log(
      `[VOICE-SYNC] 은닉 판정 집계(F-VOICE-135): channel=${this.obfuscatedChannelIds.size} ` +
        `channelEvents=${this.obfuscatedChannelEvents} category=${this.obfuscatedCategoryIds.size} ` +
        `categoryEvents=${this.obfuscatedCategoryEvents} intervalMs=${OBFUSCATION_LOG_THROTTLE_MS}`,
    );
    this.obfuscatedChannelIds.clear();
    this.obfuscatedCategoryIds.clear();
    this.obfuscatedChannelEvents = 0;
    this.obfuscatedCategoryEvents = 0;
    this.lastObfuscationLogAt = now;
  }

  /** 전송 실패는 해당 길드만 건너뛴다 — Q5: 실패는 성공 로그 억제 대상이 아니라 항상 남긴다. */
  private async syncGuild(
    guildId: string,
    users: VoiceSyncUser[],
    isInitial: boolean,
  ): Promise<number> {
    try {
      await this.apiClient.pushVoiceSync({ guildId, users });
      if (isInitial) {
        this.logger.log(`[VOICE-SYNC] guild=${guildId} synced ${users.length} user(s)`);
      }
      return users.length;
    } catch (err) {
      this.logger.error(
        `[VOICE-SYNC] guild=${guildId} sync failed`,
        err instanceof Error ? err.stack : String(err),
      );
      return 0;
    }
  }
}
