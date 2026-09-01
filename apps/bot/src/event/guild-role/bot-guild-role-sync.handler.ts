import { InjectDiscordClient, Once } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService, type GuildRolePayload } from '@onyu/bot-api-client';
import { Client, type Guild, type Role } from 'discord.js';

import { waitForApi } from '../../common/util/wait-for-api';

/**
 * Discord clientReady 이벤트 수신 후 모든 길드의 역할을 전량 bulk upsert + reconcile한다.
 * F-GUILD-ROLE-001: 봇 시작 시 초기 동기화.
 *
 * `guild-member` 이벤트 모듈(`bot-guild-member-sync.handler.ts`)과 나란한 별도 모듈이다
 * (PRD "관련 모듈" — 도메인 분리, `clientReady` 트리거만 일부 공유). `waitForApi` 게이트도
 * 동일 이식(EC-GR-22) — Discord.js는 동일 이벤트에 다중 리스너 등록을 지원하므로 두 핸들러가
 * 각자 독립적으로 대기해도 무해하다.
 */
@Injectable()
export class BotGuildRoleSyncHandler {
  private readonly logger = new Logger(BotGuildRoleSyncHandler.name);

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly apiClient: BotApiClientService,
  ) {}

  @Once('clientReady')
  async handleReady(): Promise<void> {
    this.logger.log('[GUILD-ROLE-SYNC] Discord ready — waiting for API...');

    const isApiReady = await waitForApi(this.apiClient);
    if (!isApiReady) {
      this.logger.error('[GUILD-ROLE-SYNC] API 연결 실패 — guild role sync 중단');
      return;
    }

    this.logger.log('[GUILD-ROLE-SYNC] API connected — syncing all guild roles...');

    let totalSynced = 0;
    for (const guild of this.client.guilds.cache.values()) {
      const synced = await this.syncGuild(guild);
      totalSynced += synced;
    }

    this.logger.log(`[GUILD-ROLE-SYNC] Complete — ${totalSynced} role(s) synced across all guilds`);
  }

  /**
   * 단일 길드의 전체 역할을 fetch하여 전량 upsert + reconcile을 1회 요청(E1)으로 수행한다.
   * `guildCreate` 핸들러 및 일 1회 대사 크론에서도 재사용된다.
   *
   * `guild.roles.fetch()`가 실패하면 **E1을 호출하지 않고 return 0**한다(§2-3 ① 층 — 부분
   * 목록으로 reconcile을 유발하지 않기 위함, `BotGuildMemberSyncHandler.syncGuild()` 이식).
   * Discord 역할 상한이 길드당 250개라 `guild-member`처럼 배치 분할이 불요하다.
   *
   * @returns 동기화된 역할 수 (fetch 실패 시 0)
   */
  async syncGuild(guild: Guild): Promise<number> {
    let roleList: Role[];

    try {
      const roles = await guild.roles.fetch();
      roleList = [...roles.values()];
    } catch (err) {
      this.logger.error(
        `[GUILD-ROLE-SYNC] guild=${guild.id} fetch failed`,
        err instanceof Error ? err.stack : err,
      );
      return 0;
    }

    try {
      const result = await this.apiClient.syncGuildRoles({
        guildId: guild.id,
        roles: roleList.map((role) => this.toPayload(role)),
      });

      if (result.skipped) {
        this.logger.warn(
          `[GUILD-ROLE-SYNC] guild=${guild.id} reconcile skipped: reason=${result.skipReason}`,
        );
      } else if (result.markedDeleted > 0) {
        this.logger.log(
          `[GUILD-ROLE-SYNC] guild=${guild.id} reconcile marked ${result.markedDeleted} stale role(s) deleted`,
        );
      }
    } catch (err) {
      this.logger.error(
        `[GUILD-ROLE-SYNC] guild=${guild.id} sync call failed`,
        err instanceof Error ? err.stack : err,
      );
      return 0;
    }

    this.logger.log(`[GUILD-ROLE-SYNC] guild=${guild.id} synced ${roleList.length} role(s)`);
    return roleList.length;
  }

  /**
   * discord.js `Role` → bot-api payload 매핑. `permissions`는 64비트 bitfield를 10진 문자열로
   * 변환한다(JS number 안전정수 초과 대비). `memberCount`는 `Role.members`(길드 멤버 캐시 파생)
   * 크기를 그대로 쓴다 — `clientReady` 시 `guild.members.fetch()`를 선행하지 않는다(2026-08-31
   * Q4 확정: 대형 길드 멤버 fetch 중복 부하 회피, 낮게 산출될 수 있음은 익일 대사 크론이 보정).
   */
  private toPayload(role: Role): GuildRolePayload {
    return {
      roleId: role.id,
      name: role.name,
      permissions: role.permissions.bitfield.toString(),
      color: role.color,
      position: role.position,
      hoist: role.hoist,
      mentionable: role.mentionable,
      isManaged: role.managed,
      hasTags: role.tags != null,
      memberCount: role.members.size,
    };
  }
}
