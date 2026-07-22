import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService, type VoiceStateUpdateDto } from '@onyu/bot-api-client';
import { ActivityType, type GuildMember, type VoiceState } from 'discord.js';

import { BotVoiceSendQueue } from './bot-voice-send-queue';

/** leave 전송 실패 시 재시도 최대 횟수 */
const LEAVE_RETRY_MAX = 3;
/** leave 재시도 간 대기 시간 (ms) — 고정 1초 */
const LEAVE_RETRY_DELAY_MS = 1000;

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

  constructor(private readonly apiClient: BotApiClientService) {}

  @On('voiceStateUpdate')
  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    try {
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
    if ((oldState.streaming ?? false) !== (newState.streaming ?? false)) return 'streaming_toggle';
    if (oldState.selfVideo !== newState.selfVideo) return 'video_toggle';
    if (oldState.selfDeaf !== newState.selfDeaf) return 'deaf_toggle';
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
      channelName: newState.channel?.name ?? null,
      oldChannelName: oldState.channel?.name ?? null,
      parentCategoryId: newState.channel?.parentId ?? null,
      categoryName: newState.channel?.parent?.name ?? null,
      oldParentCategoryId: oldState.channel?.parentId ?? null,
      oldCategoryName: oldState.channel?.parent?.name ?? null,
      micOn: !(newState.selfMute ?? false),
      avatarUrl: newState.member?.displayAvatarURL({ size: 128 }) ?? null,

      channelMemberCount: channelHumanMembers.length,
      oldChannelMemberCount: oldChannelHumanMembers.length,
      channelMemberIds: channelHumanMembers.map((m) => m.id),
      oldChannelMemberIds: oldChannelHumanMembers.map((m) => m.id),

      // Phase 1
      streaming: newState.streaming ?? false,
      selfVideo: newState.selfVideo,
      selfDeaf: newState.selfDeaf,

      // Phase 2
      gameName: gameActivity?.gameName ?? null,
      gameApplicationId: gameActivity?.applicationId ?? null,
    };
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
