import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import type { Message } from 'discord.js';

import { forwardWithTransientRetry } from '../message-forward-retry.util';
import { StickyActiveChannelCache } from './sticky-active-channel-cache.service';

/**
 * Discord messageCreate 이벤트를 수신하여 API로 전달한다.
 * 고정 메시지 갱신 로직(Redis 디바운싱 등)은 API에서 처리한다.
 *
 * 고정 바인딩이 걸린 채널의 메시지만 전달한다(A22 ③ — 채널 기준 사전 필터).
 * author(봇·웹훅·시스템) 기반 필터는 **두지 않는다**: 봇의 다른 메시지(슬래시 커맨드 결과 등)도
 * 고정 메시지를 하단으로 다시 내려야 하고(PRD F-STICKY-004), 에코 판정은 API 가 messageId 로 한다.
 */
@Injectable()
export class BotStickyMessageHandler {
  private readonly logger = new Logger(BotStickyMessageHandler.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly activeChannelCache: StickyActiveChannelCache,
  ) {}

  @On('messageCreate')
  async handleMessageCreate(message: Message): Promise<void> {
    const guildId = message.guildId;
    if (!guildId) return;

    if (!(await this.activeChannelCache.shouldForward(guildId, message.channelId))) return;

    const payload = {
      guildId,
      channelId: message.channelId,
      messageId: message.id,
      authorId: message.author.id,
      isBot: message.author.bot,
    };

    await forwardWithTransientRetry(
      () => this.apiClient.sendMessageCreated(payload),
      (error: unknown) => {
        this.logger.error(
          `[BOT] messageCreate forwarding failed: guild=${guildId} channel=${message.channelId}`,
          error instanceof Error ? error.stack : error,
        );
      },
    );
  }
}
