import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { type Guild } from 'discord.js';

import { BotGuildMemberSyncHandler } from './bot-guild-member-sync.handler';

/**
 * Discord guildCreate 이벤트 수신 후 신규 길드의 전체 멤버를 bulk upsert한다.
 * F-GUILD-MEMBER-002: 봇이 새 길드에 추가될 때 초기 동기화.
 */
@Injectable()
export class BotGuildCreateHandler {
  private readonly logger = new Logger(BotGuildCreateHandler.name);

  constructor(private readonly syncHandler: BotGuildMemberSyncHandler) {}

  @On('guildCreate')
  async handleGuildCreate(guild: Guild): Promise<void> {
    this.logger.log(`[GUILD-MEMBER-SYNC] guildCreate — syncing guild=${guild.id}`);

    // 멤버 동기화(guild-member 도메인 소유)와 guild_directory 기록(super-admin 도메인 소유,
    // F-SUPER-ADMIN-039 A2)은 서로 독립적인 부수효과다. 병렬로 실행해 한쪽 실패가 다른 쪽을
    // 막지 않게 하고, 대형 길드(11k 멤버 기준 syncGuild 약 4초)에서도 디렉토리 기록이 지연되지
    // 않게 한다. reconcileGuildDirectory는 내부에서 이미 try/catch + 로그를 하므로 결과값을
    // 별도로 검사하지 않는다.
    const [syncResult] = await Promise.allSettled([
      this.syncHandler.syncGuild(guild),
      this.syncHandler.reconcileGuildDirectory(),
    ]);

    if (syncResult.status === 'rejected') {
      this.logger.error(
        `[GUILD-MEMBER-SYNC] guild=${guild.id} initial sync threw unexpectedly`,
        syncResult.reason instanceof Error ? syncResult.reason.stack : syncResult.reason,
      );
      return;
    }

    if (syncResult.value === 0) {
      this.logger.warn(
        `[GUILD-MEMBER-SYNC] guild=${guild.id} initial sync failed or empty — members will accumulate via guildMemberAdd`,
      );
    }
  }
}
