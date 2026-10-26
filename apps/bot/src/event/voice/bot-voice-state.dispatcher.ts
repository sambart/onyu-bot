import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService, type VoiceStateUpdateDto } from '@onyu/bot-api-client';
import { isObfuscatedChannel } from '@onyu/shared';
import { ActivityType, type GuildMember, type VoiceState } from 'discord.js';

import { BotVoiceSendQueue } from './bot-voice-send-queue';

/** leave 전송 실패 시 재시도 최대 횟수 */
const LEAVE_RETRY_MAX = 3;
/** leave 재시도 간 대기 시간 (ms) — 고정 1초 */
const LEAVE_RETRY_DELAY_MS = 1000;

/**
 * F-VOICE-135 — 은닉 판정 집계 로그 스로틀 간격(ms, 1시간). 2026-11-16 발효 전후로
 * 판정 발생 빈도를 비교하는 것이 목적이라 시간 단위 해상도면 충분하다. 매 이벤트마다
 * 로깅하면 은닉 채널 하나가 활성 상태인 동안 이벤트가 끊임없이 들어와 로그를 도배한다.
 */
const OBFUSCATION_LOG_THROTTLE_MS = 3_600_000;

/**
 * Discord voiceStateUpdate 이벤트를 수신하여 API로 전달한다.
 * 기존 VoiceStateDispatcher의 이벤트 분류 역할만 담당하며,
 * 제외 채널 필터링·alone 감지·auto-channel empty 판단은 API에서 수행한다.
 */
@Injectable()
export class BotVoiceStateDispatcher {
  private readonly logger = new Logger(BotVoiceStateDispatcher.name);
  /**
   * 유저별(guildId:userId) 전송 순서 보장 큐. leave 재시도 지연 중 후속 이벤트가
   * 먼저 도착해 순서가 역전(신규 세션이 stale leave로 잘못 종료)되는 것을 방지한다.
   */
  private readonly sendQueue = new BotVoiceSendQueue();

  /**
   * F-VOICE-135(리뷰 후속) — 은닉 판정 집계는 "은닉이 얼마나 퍼졌는가"를 보려는 것이지
   * 이벤트 빈도에 비례해 부풀어선 안 된다. `buildPayload`가 하나의 `voiceStateUpdate`에서
   * old/new 채널 각각을 판정하므로(이동 시 2회), 단순 카운터는 실제 채널 수보다 부풀린다 —
   * Set으로 고유 채널/카테고리 id만 모아 `size`를 로깅하고, 원소(식별자)는 절대 출력하지
   * 않는다(PRD 개별 식별자 로깅 금지). 이벤트 총 횟수는 참고용 부가 필드로만 별도 유지한다.
   */
  private readonly obfuscatedChannelIds = new Set<string>();
  private readonly obfuscatedCategoryIds = new Set<string>();
  private obfuscatedChannelEvents = 0;
  private obfuscatedCategoryEvents = 0;
  private lastObfuscationLogAt = 0;

  constructor(private readonly apiClient: BotApiClientService) {}

  @On('voiceStateUpdate')
  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    try {
      if (this.isBotSubject(oldState, newState)) return;

      const eventType = this.resolveEventType(oldState, newState);
      if (!eventType) return;

      const payload = this.buildPayload(oldState, newState, eventType);
      const key = `${payload.guildId}:${payload.userId}`;
      await this.sendQueue.enqueue(key, () => this.sendWithLeaveRetry(payload));
    } catch (err) {
      this.logger.error(
        `[BOT] voiceStateUpdate forwarding failed: guild=${newState.guild.id}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  /** 이벤트 주체가 봇 계정인지 판정한다. leave 시 newState.member 가 비어 있을 수 있어 oldState 로 폴백한다. */
  private isBotSubject(oldState: VoiceState, newState: VoiceState): boolean {
    return newState.member?.user.bot ?? oldState.member?.user.bot ?? false;
  }

  /** oldState/newState 비교로 이벤트 타입을 판정한다. 해당 없으면 null(무시). */
  private resolveEventType(
    oldState: VoiceState,
    newState: VoiceState,
  ): VoiceStateUpdateDto['eventType'] | null {
    const channelId = newState.channelId;
    const oldChannelId = oldState.channelId;

    if (!oldChannelId && channelId) return 'join';
    if (oldChannelId && !channelId) return 'leave';
    if (oldChannelId && channelId && oldChannelId !== channelId) return 'move';
    if (oldState.selfMute !== newState.selfMute) return 'mic_toggle';
    if ((oldState.serverMute ?? false) !== (newState.serverMute ?? false)) return 'mic_toggle';
    if ((oldState.streaming ?? false) !== (newState.streaming ?? false)) return 'streaming_toggle';
    if (oldState.selfVideo !== newState.selfVideo) return 'video_toggle';
    if (oldState.selfDeaf !== newState.selfDeaf) return 'deaf_toggle';
    if ((oldState.serverDeaf ?? false) !== (newState.serverDeaf ?? false)) return 'deaf_toggle';
    return null;
  }

  /** API 전송 payload를 구성한다. */
  private buildPayload(
    oldState: VoiceState,
    newState: VoiceState,
    eventType: VoiceStateUpdateDto['eventType'],
  ): VoiceStateUpdateDto {
    // 현재/이전 채널 멤버 정보 (봇 제외)
    const channelHumanMembers = newState.channel
      ? [...newState.channel.members.values()].filter((m) => !m.user.bot)
      : [];
    const oldChannelHumanMembers = oldState.channel
      ? [...oldState.channel.members.values()].filter((m) => !m.user.bot)
      : [];

    const gameActivity = this.extractPlayingActivity(newState.member ?? null);

    return {
      guildId: newState.guild.id,
      userId: newState.member?.id ?? newState.id,
      channelId: newState.channelId,
      oldChannelId: oldState.channelId,
      eventType,

      userName: newState.member?.displayName ?? '',
      channelName: this.resolveChannelName(newState.channel, newState.channelId),
      oldChannelName: this.resolveChannelName(oldState.channel, oldState.channelId),
      parentCategoryId: newState.channel?.parentId ?? null,
      categoryName: this.resolveCategoryName(newState.channel),
      oldParentCategoryId: oldState.channel?.parentId ?? null,
      oldCategoryName: this.resolveCategoryName(oldState.channel),
      micOn: !(newState.selfMute ?? false) && !(newState.serverMute ?? false),
      avatarUrl: newState.member?.displayAvatarURL({ size: 128 }) ?? null,

      channelMemberCount: channelHumanMembers.length,
      oldChannelMemberCount: oldChannelHumanMembers.length,
      channelMemberIds: channelHumanMembers.map((m) => m.id),
      oldChannelMemberIds: oldChannelHumanMembers.map((m) => m.id),

      // Phase 1
      streaming: newState.streaming ?? false,
      selfVideo: newState.selfVideo,
      selfDeaf: newState.selfDeaf,
      serverMute: newState.serverMute ?? false,
      serverDeaf: newState.serverDeaf ?? false,

      // Phase 2
      gameName: gameActivity?.gameName ?? null,
      gameApplicationId: gameActivity?.applicationId ?? null,
    };
  }

  /**
   * 채널 이름을 은닉 여부에 따라 정규화한다. 은닉 채널(F1)이면 `null` 을 돌려줘
   * `'___hidden___'` 리터럴이 파이프라인으로 전파되지 않게 한다.
   * `channelId` 는 집계 로그(F-VOICE-135)의 Set 키로만 쓴다 — 호출부(`buildPayload`)가
   * 이미 갖고 있는 `newState.channelId`/`oldState.channelId` 를 그대로 넘겨받아, `channel`
   * 목 객체에 `id` 필드를 새로 요구하지 않는다.
   */
  private resolveChannelName(
    channel: VoiceState['channel'],
    channelId: string | null,
  ): string | null {
    if (!channel) return null;
    if (isObfuscatedChannel(channel.flags?.bitfield, channel.name)) {
      if (channelId) this.obfuscatedChannelIds.add(channelId);
      this.obfuscatedChannelEvents++;
      this.maybeLogObfuscationSummary();
      return null;
    }
    return channel.name;
  }

  /**
   * 카테고리(부모 채널) 이름을 은닉 여부에 따라 정규화한다.
   * 채널과 카테고리는 각각 독립적으로 은닉될 수 있어(엣지 ⓐ), `channel` 자체의 은닉
   * 판정 결과를 재사용하지 않고 `channel.parent` 를 별도로 판정한다.
   */
  private resolveCategoryName(channel: VoiceState['channel']): string | null {
    const parent = channel?.parent;
    if (!parent) return null;
    if (isObfuscatedChannel(parent.flags?.bitfield, parent.name)) {
      // 카테고리 식별자는 이미 갖고 있는 channel.parentId를 재사용한다(parent.id 목킹 요구 회피).
      const categoryId = channel?.parentId;
      if (categoryId) this.obfuscatedCategoryIds.add(categoryId);
      this.obfuscatedCategoryEvents++;
      this.maybeLogObfuscationSummary();
      return null;
    }
    return parent.name;
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
      `[BOT] 은닉 판정 집계(F-VOICE-135): channel=${this.obfuscatedChannelIds.size} ` +
        `channelEvents=${this.obfuscatedChannelEvents} category=${this.obfuscatedCategoryIds.size} ` +
        `categoryEvents=${this.obfuscatedCategoryEvents} intervalMs=${OBFUSCATION_LOG_THROTTLE_MS}`,
    );
    this.obfuscatedChannelIds.clear();
    this.obfuscatedCategoryIds.clear();
    this.obfuscatedChannelEvents = 0;
    this.obfuscatedCategoryEvents = 0;
    this.lastObfuscationLogAt = now;
  }

  /**
   * leave 이벤트 한정 유한 재시도 전송.
   * leave 유실 시 세션이 닫히지 않아 좀비 세션의 씨앗이 되므로, 전송 실패에 한해
   * `LEAVE_RETRY_MAX`회까지 `LEAVE_RETRY_DELAY_MS` 간격으로 재시도한다.
   * join/mic 등 non-leave 이벤트는 재시도하지 않는다(유실돼도 다음 이벤트/스냅샷이 보정).
   * 전부 실패해도 예외를 던지지 않고 로그만 남긴다 — sweep/recovery가 최종 방어선이다.
   * 호출자(`handleVoiceStateUpdate`)가 `BotVoiceSendQueue`로 감싸므로, 재시도 지연 중에도
   * 같은 유저의 후속 이벤트가 이 전송보다 먼저 API에 도착하지 않는다(순서 역전 방지).
   */
  private async sendWithLeaveRetry(payload: VoiceStateUpdateDto): Promise<void> {
    if (payload.eventType !== 'leave') {
      await this.apiClient.sendVoiceStateUpdate(payload);
      return;
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= LEAVE_RETRY_MAX; attempt++) {
      try {
        await this.apiClient.sendVoiceStateUpdate(payload);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < LEAVE_RETRY_MAX) {
          await this.delay(LEAVE_RETRY_DELAY_MS);
        }
      }
    }

    this.logger.error(
      `[BOT] leave 전송 ${LEAVE_RETRY_MAX}회 재시도 모두 실패: guild=${payload.guildId} user=${payload.userId}`,
      lastError instanceof Error ? lastError.stack : lastError,
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** member.presence.activities에서 ActivityType.Playing 추출 */
  private extractPlayingActivity(
    member: GuildMember | null,
  ): { gameName: string; applicationId: string | null } | null {
    if (!member) return null;
    const activities = member.presence?.activities;
    if (!activities) return null;

    const playing = activities.find((a) => a.type === ActivityType.Playing);
    if (!playing) return null;

    return {
      gameName: playing.name,
      applicationId: playing.applicationId ?? null,
    };
  }
}
