import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { type Guild, type Role } from 'discord.js';

import { BotGuildRoleSyncHandler } from './bot-guild-role-sync.handler';

/**
 * roleCreate/roleUpdate/roleDelete/guildDelete 증분 이벤트 핸들러(F-GUILD-ROLE-003~005·007).
 * `guildDelete`는 usage-analytics 도메인의 `BotGuildLifecycleHandler`와 독립적으로 병행
 * 구독한다(Endpoint Spec §5-1 — cross-domain 결합 회피, 기존 핸들러는 무변경).
 */
@Injectable()
export class BotGuildRoleEventHandler {
  private readonly logger = new Logger(BotGuildRoleEventHandler.name);

  /** 길드별 자가치유 재sync 진행 중 표시 — 같은 길드의 연속 실패가 재sync를 N배로 증폭시키지 않게 한다. */
  private readonly resyncInFlightGuilds = new Set<string>();

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly syncHandler: BotGuildRoleSyncHandler,
  ) {}

  /** 역할 생성 반영(F-003). 신규 역할은 생성 직후 보유 멤버가 없으므로 memberCount=0으로 고정. */
  @On('roleCreate')
  async handleRoleCreate(role: Role): Promise<void> {
    try {
      const result = await this.apiClient.upsertGuildRole({
        guildId: role.guild.id,
        roleId: role.id,
        name: role.name,
        permissions: role.permissions.bitfield.toString(),
        color: role.color,
        position: role.position,
        hoist: role.hoist,
        mentionable: role.mentionable,
        isManaged: role.managed,
        hasTags: role.tags != null,
        memberCount: 0,
      });
      // `?.` 는 타입상 불필요해 보이지만 런타임 방어가 목적이다 — 프록시/게이트웨이가 개입해
      // 200에 다른 body를 실어 보내거나 컨트롤러 계약이 드리프트하면 `ok` 필드 자체가 없을 수
      // 있다(2026-08-25 nginx 설정 문제로 프로덕션이 비정상 응답을 반환한 관측 사례 있음).
      // 그 경우도 무성 유실 방지를 위해 자가치유를 트리거해야 하므로 `undefined`를 실패로 간주한다.
      if (!result?.ok) {
        await this.resyncGuild(role.guild, 'roleCreate');
      }
    } catch (err) {
      this.logger.error(
        `[GUILD-ROLE-EVENT] roleCreate upsert failed: guild=${role.guild.id} role=${role.id}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  /** 역할 갱신 반영(F-004). 변경분 판별 없이 전체 컬럼 재기입. */
  @On('roleUpdate')
  async handleRoleUpdate(_oldRole: Role, newRole: Role): Promise<void> {
    try {
      const result = await this.apiClient.upsertGuildRole({
        guildId: newRole.guild.id,
        roleId: newRole.id,
        name: newRole.name,
        permissions: newRole.permissions.bitfield.toString(),
        color: newRole.color,
        position: newRole.position,
        hoist: newRole.hoist,
        mentionable: newRole.mentionable,
        isManaged: newRole.managed,
        hasTags: newRole.tags != null,
        memberCount: newRole.members.size,
      });
      // `?.` 근거는 handleRoleCreate와 동일(런타임 방어 — `ok` 필드 부재도 실패로 간주).
      if (!result?.ok) {
        await this.resyncGuild(newRole.guild, 'roleUpdate');
      }
    } catch (err) {
      this.logger.error(
        `[GUILD-ROLE-EVENT] roleUpdate upsert failed: guild=${newRole.guild.id} role=${newRole.id}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  /** 역할 삭제 반영(F-005) — 소프트 마킹. */
  @On('roleDelete')
  async handleRoleDelete(role: Role): Promise<void> {
    try {
      const result = await this.apiClient.markGuildRoleDeleted({
        guildId: role.guild.id,
        roleId: role.id,
      });
      // `?.` 근거는 handleRoleCreate와 동일(런타임 방어 — `ok` 필드 부재도 실패로 간주).
      if (!result?.ok) {
        await this.resyncGuild(role.guild, 'roleDelete');
      }
    } catch (err) {
      this.logger.error(
        `[GUILD-ROLE-EVENT] roleDelete mark failed: guild=${role.guild.id} role=${role.id}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  /**
   * 증분 반영이 `ok:false`로 거부됐을 때의 자가치유 — 해당 길드 전량 스냅샷을 1회 재동기화한다
   * (`guildCreate`가 쓰는 것과 동일한 `syncGuild()` 경로 재사용).
   *
   * ⚠️ 계약: **1회 한정, 재귀 없음.** 재sync 자체가 실패해도 다시 재sync하지 않는다 —
   * 실패 시 error 로그만 남기고 일 1회 대사 크론(`30 4 * * *`)의 자연 복구에 맡긴다.
   */
  private async resyncGuild(guild: Guild, trigger: string): Promise<void> {
    if (this.resyncInFlightGuilds.has(guild.id)) return;
    this.resyncInFlightGuilds.add(guild.id);
    try {
      const synced = await this.syncHandler.syncGuild(guild);
      this.logger.warn(
        `[GUILD-ROLE-EVENT] ${trigger} ok:false — 길드 전량 재동기화 수행: guild=${guild.id} synced=${synced}`,
      );
    } catch (err) {
      this.logger.error(
        `[GUILD-ROLE-EVENT] ${trigger} 재동기화 실패(재시도 없음 — 일 1회 대사 크론 대기): guild=${guild.id}`,
        err instanceof Error ? err.stack : err,
      );
    } finally {
      this.resyncInFlightGuilds.delete(guild.id);
    }
  }

  /**
   * 길드 이탈 시 하드 삭제(F-007). usage-analytics `BotGuildLifecycleHandler`의 동일 이벤트
   * 구독과 독립적으로 동작한다(한쪽 실패가 다른 쪽을 막지 않음, Endpoint Spec §5-1 근거4).
   */
  @On('guildDelete')
  async handleGuildDelete(guild: Guild): Promise<void> {
    try {
      const result = await this.apiClient.purgeGuildRoles({ guildId: guild.id });
      this.logger.log(
        `[GUILD-ROLE-EVENT] guildDelete purge: guild=${guild.id} deleted=${result.deleted}`,
      );
    } catch (err) {
      this.logger.error(
        `[GUILD-ROLE-EVENT] guildDelete purge failed: guild=${guild.id}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
