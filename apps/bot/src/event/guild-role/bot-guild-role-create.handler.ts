import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { type Guild } from 'discord.js';

import { BotGuildRoleSyncHandler } from './bot-guild-role-sync.handler';

/**
 * Discord guildCreate 이벤트 수신 후 신규 길드의 전체 역할을 전량 upsert + reconcile한다.
 * F-GUILD-ROLE-002: 봇이 새 길드에 추가될 때 초기 동기화.
 */
@Injectable()
export class BotGuildRoleCreateHandler {
  private readonly logger = new Logger(BotGuildRoleCreateHandler.name);

  constructor(private readonly syncHandler: BotGuildRoleSyncHandler) {}

  @On('guildCreate')
  async handleGuildCreate(guild: Guild): Promise<void> {
    this.logger.log(`[GUILD-ROLE-SYNC] guildCreate — syncing guild=${guild.id}`);

    const synced = await this.syncHandler.syncGuild(guild);

    if (synced === 0) {
      this.logger.warn(
        `[GUILD-ROLE-SYNC] guild=${guild.id} initial sync failed or empty — roles will accumulate via roleCreate`,
      );
    }
  }
}
