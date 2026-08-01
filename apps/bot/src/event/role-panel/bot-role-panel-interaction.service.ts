import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService, type BotRolePanelConfigDto } from '@onyu/bot-api-client';
import { RolePanelButtonMode } from '@onyu/shared';
import { DiscordAPIError, GuildMember } from 'discord.js';

import { acquireLock, releaseLock } from './role-panel-toggle-lock';

/** Discord REST API 에러 코드 — Missing Permissions */
const DISCORD_ERR_MISSING_PERMISSIONS = 50013;

/** Discord REST API 에러 코드 — Unknown Role */
const DISCORD_ERR_UNKNOWN_ROLE = 10011;

/** Discord REST HTTP 상태 코드 — Forbidden (권한 없음) */
const DISCORD_HTTP_FORBIDDEN = 403;

/** 역할 처리 결과 상태 */
export type RolePanelInteractionStatus =
  | 'GRANTED'
  | 'REMOVED'
  | 'SWAPPED'
  | 'ALREADY_HAS'
  | 'ALREADY_SELECTED'
  | 'NOT_FOUND'
  | 'NO_PERMISSION'
  | 'UNKNOWN_ROLE'
  | 'LOCKED';

export interface RolePanelInteractionResult {
  status: RolePanelInteractionStatus;
  /** 클릭한 버튼의 localeTag — 핸들러가 응답 언어 즉시 결정 + locale 저장에 사용 (F-ROLE-PANEL-010) */
  localeTag: 'ko' | 'en' | null;
}

/** 봇-API config 응답 버튼 항목 (BotRolePanelConfigDto.buttons 원소) */
type RolePanelButtonConfig = BotRolePanelConfigDto['buttons'][number];

/** 서비스 입력 파라미터 */
export interface HandleRolePanelButtonInput {
  guildId: string;
  userId: string;
  member: GuildMember;
  panelId: number;
  buttonId: number;
}

/** 역할 부여/회수 개별 적용 결과 */
interface ApplyOpsResult {
  applied: number;
  firstFailure: RolePanelInteractionStatus | null;
}

/** 역할 부여/회수 대상 묶음 */
interface RoleOps {
  add: string[];
  remove: string[];
}

/**
 * 역할 패널 버튼 인터랙션 비즈니스 로직.
 * Discord 응답(deferReply / editReply)은 핸들러가 담당하며,
 * 이 서비스는 역할 부여/회수 처리 결과 상태만 반환한다.
 */
@Injectable()
export class RolePanelInteractionService {
  private readonly logger = new Logger(RolePanelInteractionService.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  async handle(input: HandleRolePanelButtonInput): Promise<RolePanelInteractionResult> {
    const { guildId, userId, member, panelId, buttonId } = input;

    // config 조회 — API가 Redis 캐시 우선 → 미스 시 DB 조회
    const response = await this.apiClient.getRolePanelConfig(guildId);

    if (!response.ok || !response.data) {
      this.logger.warn(`[ROLE_PANEL] Config not found: guild=${guildId}`);
      return { status: 'NOT_FOUND', localeTag: null };
    }

    const panelConfig = response.data.find((p) => p.panelId === panelId);
    const buttonConfig: RolePanelButtonConfig | undefined = panelConfig?.buttons.find(
      (b) => b.buttonId === buttonId,
    );

    if (!buttonConfig) {
      this.logger.warn(
        `[ROLE_PANEL] Button config not found: guild=${guildId} panel=${panelId} button=${buttonId}`,
      );
      return { status: 'NOT_FOUND', localeTag: null };
    }

    const localeTag = buttonConfig.localeTag ?? null;

    try {
      let result: Omit<RolePanelInteractionResult, 'localeTag'>;
      if (buttonConfig.mode === RolePanelButtonMode.GRANT) {
        result = await this.handleGrant(member, buttonConfig.roleIds, { guildId, userId });
      } else if (buttonConfig.mode === RolePanelButtonMode.TOGGLE) {
        result = await this.handleToggle(member, buttonConfig.roleIds, {
          guildId,
          userId,
          buttonId,
        });
      } else {
        result = await this.handleExclusive(member, buttonConfig, panelConfig?.buttons ?? [], {
          guildId,
          userId,
        });
      }
      return { ...result, localeTag };
    } catch (error) {
      return { ...this.mapDiscordError(error, { guildId, userId }), localeTag };
    }
  }

  /**
   * GRANT 모드: 이미 전체 보유 시 안내만, 미보유분만 부여(F-ROLE-PANEL-008 배열화).
   * 멱등 — 전부 보유 시 Discord API 호출 0회.
   */
  private async handleGrant(
    member: GuildMember,
    roleIds: string[],
    ctx: { guildId: string; userId: string },
  ): Promise<Omit<RolePanelInteractionResult, 'localeTag'>> {
    const { guildId, userId } = ctx;
    const toAdd = roleIds.filter((id) => !member.roles.cache.has(id));

    if (toAdd.length === 0) {
      return { status: 'ALREADY_HAS' };
    }

    const result = await this.applyOps(member, { add: toAdd, remove: [] }, ctx);
    if (result.applied === 0) {
      return { status: result.firstFailure ?? 'NO_PERMISSION' };
    }

    this.logger.log(
      `[ROLE_PANEL] Role(s) granted: guild=${guildId} user=${userId} roles=${toAdd.join(',')}`,
    );
    return { status: 'GRANTED' };
  }

  /**
   * TOGGLE 모드: 전부 보유 시 회수, 전무 보유 시 부여, 일부 보유 시 미보유분만 부여
   * (보유분은 회수하지 않는다 — "절반만 잃는" 상태를 만들지 않기 위함, F-ROLE-PANEL-008).
   * 인메모리 락으로 동시 클릭 레이스 방지(UC-05 F-01).
   */
  private async handleToggle(
    member: GuildMember,
    roleIds: string[],
    ctx: { guildId: string; userId: string; buttonId: number },
  ): Promise<Omit<RolePanelInteractionResult, 'localeTag'>> {
    const { guildId, userId, buttonId } = ctx;
    const lockKey = `${guildId}:${userId}:${buttonId}`;

    if (!acquireLock(lockKey)) {
      return { status: 'LOCKED' };
    }

    try {
      const held = roleIds.filter((id) => member.roles.cache.has(id));

      if (held.length === roleIds.length) {
        const result = await this.applyOps(member, { add: [], remove: roleIds }, ctx);
        if (result.applied === 0) {
          return { status: result.firstFailure ?? 'NO_PERMISSION' };
        }
        this.logger.log(
          `[ROLE_PANEL] Role(s) removed: guild=${guildId} user=${userId} roles=${roleIds.join(',')}`,
        );
        return { status: 'REMOVED' };
      }

      // 전무 보유 또는 일부 보유 — 미보유분만 부여 (보유분은 그대로 유지)
      const toAdd = roleIds.filter((id) => !member.roles.cache.has(id));
      const result = await this.applyOps(member, { add: toAdd, remove: [] }, ctx);
      if (result.applied === 0) {
        return { status: result.firstFailure ?? 'NO_PERMISSION' };
      }
      this.logger.log(
        `[ROLE_PANEL] Role(s) granted: guild=${guildId} user=${userId} roles=${toAdd.join(',')}`,
      );
      return { status: 'GRANTED' };
    } finally {
      releaseLock(lockKey);
    }
  }

  /**
   * EXCLUSIVE 모드(F-ROLE-PANEL-009): 같은 exclusiveGroupKey를 공유하는 형제 버튼 전체(클릭 버튼 포함)의
   * roleIds 합집합을 universe로 삼아, 클릭 버튼의 roleIds만 부여하고 나머지(universe - 클릭 roleIds)를 회수한다.
   * 그룹 내 모든 버튼에 공통으로 넣은 역할은 universe에서도 grant 대상에 포함되므로 보존된다.
   *
   * 그룹 단위 락(`role-panel-toggle-lock.ts` 재사용, 키만 groupKey 확장)으로 같은 그룹의
   * 서로 다른 버튼 간 동시 클릭 경합까지 막는다.
   */
  private async handleExclusive(
    member: GuildMember,
    clicked: RolePanelButtonConfig,
    siblingButtons: RolePanelButtonConfig[],
    ctx: { guildId: string; userId: string },
  ): Promise<Omit<RolePanelInteractionResult, 'localeTag'>> {
    const { guildId, userId } = ctx;
    const groupKey = clicked.exclusiveGroupKey;

    // 방어: DB cross-column CHECK가 없으므로 groupKey 누락 데이터가 이론상 가능하다.
    // 그 경우 GRANT와 동등 동작으로 폴백한다(에러 아님 — 단독 그룹과 결과가 같다).
    if (!groupKey) {
      return this.handleGrant(member, clicked.roleIds, ctx);
    }

    const siblings = siblingButtons.filter(
      (b) => b.mode === RolePanelButtonMode.EXCLUSIVE && b.exclusiveGroupKey === groupKey,
    );
    const universe = new Set(siblings.flatMap((b) => b.roleIds));
    const grantIds = [...new Set(clicked.roleIds)];
    const revokeIds = [...universe].filter((id) => !grantIds.includes(id));

    const lockKey = `${guildId}:${userId}:${groupKey}`;
    if (!acquireLock(lockKey)) {
      return { status: 'LOCKED' };
    }

    try {
      const held = member.roles.cache;
      const toAdd = grantIds.filter((id) => !held.has(id));
      const toRemove = revokeIds.filter((id) => held.has(id));

      // 멱등 판정: grant 대상 전부 보유 AND revoke 대상 전부 미보유 → Discord API 0회
      if (toAdd.length === 0 && toRemove.length === 0) {
        return { status: 'ALREADY_SELECTED' };
      }

      // 회수 → 부여 순서 고정(UC-06 AF-01 단계 3)
      const result = await this.applyOps(member, { remove: toRemove, add: toAdd }, ctx);
      if (result.applied === 0) {
        return { status: result.firstFailure ?? 'NO_PERMISSION' };
      }
      this.logger.log(
        `[ROLE_PANEL] EXCLUSIVE applied: guild=${guildId} user=${userId} group=${groupKey} add=${toAdd.join(',')} remove=${toRemove.join(',')}`,
      );
      return { status: toRemove.length > 0 ? 'SWAPPED' : 'GRANTED' };
    } finally {
      releaseLock(lockKey);
    }
  }

  /**
   * 역할 부여/회수를 개별 API 호출로 best-effort 적용한다(F-ROLE-PANEL-008 부분 실패 정책).
   * 회수를 먼저, 그다음 부여를 시도한다. 각 역할 ID마다 개별 try/catch로 격리하며,
   * DiscordAPIError는 상태로 흡수해 계속 진행하고(1건이라도 성공하면 성공 상태),
   * 비-DiscordAPIError는 즉시 rethrow한다(핸들러 catch → genericError).
   */
  private async applyOps(
    member: GuildMember,
    ops: RoleOps,
    ctx: { guildId: string; userId: string },
  ): Promise<ApplyOpsResult> {
    let applied = 0;
    let firstFailure: RolePanelInteractionStatus | null = null;

    for (const roleId of ops.remove) {
      try {
        await member.roles.remove(roleId);
        applied += 1;
      } catch (error) {
        const status = this.resolveDiscordErrorStatus(error, { ...ctx, roleId });
        firstFailure = firstFailure === 'NO_PERMISSION' ? firstFailure : status;
      }
    }

    for (const roleId of ops.add) {
      try {
        await member.roles.add(roleId);
        applied += 1;
      } catch (error) {
        const status = this.resolveDiscordErrorStatus(error, { ...ctx, roleId });
        firstFailure = firstFailure === 'NO_PERMISSION' ? firstFailure : status;
      }
    }

    return { applied, firstFailure };
  }

  /**
   * Discord REST API 에러를 역할 패널 상태로 매핑한다(개별 역할 단위).
   * - 50013(Missing Permissions) / 위계 위반(403) → NO_PERMISSION
   * - 10011(Unknown Role) → UNKNOWN_ROLE
   * - 그 외 → 재던짐 (applyOps 호출부 → 핸들러 catch → 일반 오류 응답)
   */
  private resolveDiscordErrorStatus(
    error: unknown,
    ctx: { guildId: string; userId: string; roleId: string },
  ): RolePanelInteractionStatus {
    const { guildId, userId, roleId } = ctx;

    if (error instanceof DiscordAPIError) {
      this.logger.warn(
        `[ROLE_PANEL] Discord API error: guild=${guildId} user=${userId} role=${roleId} code=${error.code} status=${error.status}`,
      );

      if (
        error.code === DISCORD_ERR_MISSING_PERMISSIONS ||
        error.status === DISCORD_HTTP_FORBIDDEN
      ) {
        return 'NO_PERMISSION';
      }

      if (error.code === DISCORD_ERR_UNKNOWN_ROLE) {
        return 'UNKNOWN_ROLE';
      }
    }

    // 그 외 예외는 applyOps 밖으로 재던짐(핸들러 catch 블록에서 일반 오류로 처리)
    throw error;
  }

  /**
   * handle() 흐름 전체(config 조회 이후 예외)를 상태로 매핑한다.
   * mode 분기 함수(handleGrant/handleToggle/handleExclusive) 밖에서 던져진
   * 비-DiscordAPIError만 여기까지 도달한다(applyOps 내부 실패는 이미 상태로 흡수됨).
   */
  private mapDiscordError(
    error: unknown,
    ctx: { guildId: string; userId: string },
  ): Omit<RolePanelInteractionResult, 'localeTag'> {
    const { guildId, userId } = ctx;

    if (error instanceof DiscordAPIError) {
      this.logger.warn(
        `[ROLE_PANEL] Discord API error: guild=${guildId} user=${userId} code=${error.code} status=${error.status}`,
      );

      if (
        error.code === DISCORD_ERR_MISSING_PERMISSIONS ||
        error.status === DISCORD_HTTP_FORBIDDEN
      ) {
        return { status: 'NO_PERMISSION' };
      }

      if (error.code === DISCORD_ERR_UNKNOWN_ROLE) {
        return { status: 'UNKNOWN_ROLE' };
      }
    }

    // 그 외 예외는 핸들러 catch 블록에서 일반 오류로 처리
    throw error;
  }
}
