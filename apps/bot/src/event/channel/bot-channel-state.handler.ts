import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { Channel } from 'discord.js';

/**
 * Discord 채널 생성/삭제/변경 이벤트를 수신하여 로그를 남긴다.
 * 현재는 로깅만 수행하며, 추후 API 전달이 필요하면 확장한다.
 */
@Injectable()
export class BotChannelStateHandler {
  private readonly logger = new Logger(BotChannelStateHandler.name);

  @On('channelCreate')
  handleChannelCreate(channel: Channel): void {
    try {
      if ('name' in channel) {
        this.logger.log(`[BOT] New channel created: ${channel.name}`);
      }
    } catch (error) {
      this.logger.error(
        '[BOT] channelCreate error',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  @On('channelDelete')
  handleChannelDelete(channel: Channel): void {
    try {
      if ('name' in channel) {
        this.logger.log(`[BOT] Channel deleted: ${channel.name}`);
      }
    } catch (error) {
      this.logger.error(
        '[BOT] channelDelete error',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  @On('channelUpdate')
  handleChannelUpdate(oldChannel: Channel, newChannel: Channel): void {
    try {
      if ('name' in oldChannel && 'name' in newChannel) {
        this.logger.log(`[BOT] Channel updated from ${oldChannel.name} to ${newChannel.name}`);
      }
    } catch (error) {
      this.logger.error(
        '[BOT] channelUpdate error',
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
