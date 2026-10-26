import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { isObfuscatedChannel } from '@onyu/shared';
import type { Channel } from 'discord.js';

/** 은닉 채널의 로그 표기. 실명 대신 이 값과 `channel.id` 를 남겨 관측성을 유지한다. */
const HIDDEN_CHANNEL_LOG_LABEL = '(hidden)';

/**
 * Discord 채널 생성/삭제/변경 이벤트를 수신하여 로그를 남긴다.
 * 채널 삭제는 로그 외에 API 로 알려(설정 자동 조치 기록 ④) 삭제된 채널을 참조하는 설정을 기록하게 한다.
 */
@Injectable()
export class BotChannelStateHandler {
  private readonly logger = new Logger(BotChannelStateHandler.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @On('channelCreate')
  handleChannelCreate(channel: Channel): void {
    try {
      if ('name' in channel) {
        this.logger.log(`[BOT] New channel created: ${this.resolveLogName(channel)}`);
      }
    } catch (error) {
      this.logger.error('[BOT] channelCreate error', error instanceof Error ? error.stack : error);
    }
  }

  @On('channelDelete')
  handleChannelDelete(channel: Channel): void {
    try {
      if ('name' in channel) {
        this.logger.log(`[BOT] Channel deleted: ${this.resolveLogName(channel)}`);
      }
      this.reportChannelDeleted(channel);
    } catch (error) {
      this.logger.error('[BOT] channelDelete error', error instanceof Error ? error.stack : error);
    }
  }

  @On('channelUpdate')
  handleChannelUpdate(oldChannel: Channel, newChannel: Channel): void {
    try {
      if ('name' in oldChannel && 'name' in newChannel) {
        // old/new 를 각각 독립 판정한다 — 은닉↔공개 전환 시 실재하지 않는 rename 이
        // 로그에 남지 않게 하면서도, 전환 자체는 로그로 드러나야 한다(운영 포렌식 근거).
        this.logger.log(
          `[BOT] Channel updated from ${this.resolveLogName(oldChannel)} to ${this.resolveLogName(newChannel)}`,
        );
      }
    } catch (error) {
      this.logger.error('[BOT] channelUpdate error', error instanceof Error ? error.stack : error);
    }
  }

  /**
   * 길드 채널 삭제를 API 에 알린다. fire-and-forget — await 하지 않고 실패는 로그만 남긴다(재시도 없음).
   * DM·스레드·길드 없는 채널은 설정이 참조하지 않으므로 호출하지 않는다. 채널 이름은 보내지 않는다.
   */
  private reportChannelDeleted(channel: Channel): void {
    if (channel.isDMBased() || channel.isThread()) {
      return;
    }
    const guildId = channel.guildId;
    if (!guildId) {
      return;
    }
    this.apiClient
      .reportChannelDeleted({ guildId, channelId: channel.id })
      .catch((error: unknown) => {
        this.logger.warn(
          `[BOT] channelDelete 보고 실패: channelId=${channel.id} — ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }

  /**
   * 로그용 채널 표기를 만든다. 은닉 채널(F1)이면 실명 대신
   * `(hidden)` + `channel.id` 를 남겨, 가짜 rename 로그로 인한 운영 오독을 막으면서도
   * 어떤 채널에서 발생했는지는 추적 가능하게 한다.
   * `Channel` 유니온에 `flags` 가 없는 멤버가 있어 `'flags' in channel` 로 내로잉한다.
   */
  private resolveLogName(channel: Channel & { name: string }): string {
    const flagsBitfield = 'flags' in channel ? channel.flags?.bitfield : null;
    if (isObfuscatedChannel(flagsBitfield, channel.name)) {
      return `${HIDDEN_CHANNEL_LOG_LABEL} (id=${channel.id})`;
    }
    return channel.name;
  }
}
