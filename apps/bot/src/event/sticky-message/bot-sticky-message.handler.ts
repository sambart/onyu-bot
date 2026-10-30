import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import type { Message } from 'discord.js';

import { forwardWithTransientRetry } from '../message-forward-retry.util';

/**
 * Discord messageCreate 이벤트를 수신하여 API로 전달한다.
 * 고정 메시지 갱신 로직(Redis 디바운싱 등)은 API에서 처리한다.
 */
@Injectable()
export class BotStickyMessageHandler {
  private readonly logger = new Logger(BotStickyMessageHandler.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @On('messageCreate')
  async handleMessageCreate(message: Message): Promise<void> {
    const guildId = message.guildId;
    if (!guildId) return;

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
