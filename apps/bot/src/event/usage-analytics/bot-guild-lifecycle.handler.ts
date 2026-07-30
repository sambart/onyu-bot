import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService, type GuildLifecycleEventDto } from '@onyu/bot-api-client';
import type { Guild } from 'discord.js';

/**
 * 독립 길드 생애주기 수집 이벤트 핸들러 (F-USAGE-013/014).
 * 봇이 길드에 추가/제거될 때 join/leave 를 각각 기록한다.
 *
 * 유저 ID·길드명·멤버 수는 수집하지 않는다 — guildId/eventType 만 API로 전달한다
 * (개인 미식별 🔒, PRD §15-2).
 */
@Injectable()
export class BotGuildLifecycleHandler {
  private readonly logger = new Logger(BotGuildLifecycleHandler.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @On('guildCreate')
  async handleGuildCreate(guild: Guild): Promise<void> {
    await this.send({ guildId: guild.id, eventType: 'join' });
  }

  @On('guildDelete')
  async handleGuildDelete(guild: Guild): Promise<void> {
    await this.send({ guildId: guild.id, eventType: 'leave' });
  }

  // fire-and-forget. 생애주기 이벤트는 저빈도라 재시도 없이 단순 catch 로그로 충분(구현 재량).
  private async send(dto: GuildLifecycleEventDto): Promise<void> {
    await this.apiClient.sendGuildLifecycleEvent(dto).catch((err: unknown) => {
      this.logger.error(
        `[BOT] guildLifecycleEvent forwarding failed: guild=${dto.guildId} eventType=${dto.eventType}`,
        err instanceof Error ? err.stack : err,
      );
    });
  }
}
