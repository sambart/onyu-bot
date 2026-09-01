import { InjectDiscordClient } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Client } from 'discord.js';

import { BotGuildRoleSyncHandler } from './bot-guild-role-sync.handler';

/**
 * 일 1회 전 길드 순회 전량 대사 크론(F-GUILD-ROLE-006). `guild-member` 선례("재기동 시에만
 * 대사")의 약점(봇 다운타임 중 이벤트 유실 시 다음 재기동까지 stale 지속)을 보완한다.
 *
 * 실행 위치는 **봇 자체 크론**(0-3/Q3 확정, 2026-08-31) — API 프로세스는 REST `APIRole`
 * 응답에 보유 인원 수가 없어 `memberCount`를 갱신할 수 없다. 시각은 `30 4 * * *`
 * KST(Q6 확정) — 04:00 KST 슬롯에 이미 몰려 있는 API 크론 3종(voice-data-retention 등)과의
 * DB 경합을 피하기 위해 30분 오프셋을 둔다.
 *
 * 봇 프로세스가 단일 인스턴스(ShardingManager 미사용)라 다중 인스턴스 중복 실행 위험이 없다.
 */
@Injectable()
export class BotGuildRoleReconcileScheduler {
  private readonly logger = new Logger(BotGuildRoleReconcileScheduler.name);

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly syncHandler: BotGuildRoleSyncHandler,
  ) {}

  @Cron('30 4 * * *', { name: 'guild-role-daily-reconcile', timeZone: 'Asia/Seoul' })
  async reconcileAllGuilds(): Promise<void> {
    this.logger.log('[GUILD-ROLE-RECONCILE] Daily reconcile — syncing all guild roles...');

    let totalSynced = 0;
    // 순회 대상은 client.guilds.cache — 봇이 현재 참여 중인 길드만 포함되므로 guildDelete로
    // 이탈한 길드가 좀비 재삽입될 위험이 구조적으로 차단된다.
    for (const guild of this.client.guilds.cache.values()) {
      // 순회 도중 이탈한 길드 방어(DB 설계 지침 #14) — 처리 직전 재확인 후 스킵.
      if (!this.client.guilds.cache.has(guild.id)) {
        this.logger.warn(`[GUILD-ROLE-RECONCILE] guild=${guild.id} 이탈 감지 — 스킵`);
        continue;
      }

      const synced = await this.syncHandler.syncGuild(guild);
      totalSynced += synced;
    }

    this.logger.log(
      `[GUILD-ROLE-RECONCILE] Complete — ${totalSynced} role(s) synced across all guilds`,
    );
  }
}
