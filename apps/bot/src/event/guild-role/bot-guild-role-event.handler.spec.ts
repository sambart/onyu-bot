/**
 * BotGuildRoleEventHandler 단위 테스트 — roleCreate/roleUpdate/roleDelete/guildDelete
 * (F-GUILD-ROLE-003~005·007).
 *
 * 핵심 회귀 방지 — 두 경로가 서로 다른 계약을 따른다(PR #480 결함③ 수리):
 * - **HTTP throw**(네트워크·타임아웃·5xx): 예외를 던지지 않고 에러 로그만 남긴다(discord.js
 *   이벤트 루프 생존). **재시도도, 재동기화도 하지 않는다.**
 * - **`200 { ok:false }`**(전송 성공 + 서버측 처리 실패): 해당 길드 전량 스냅샷 재동기화를
 *   **1회** 수행한다(`BotGuildRoleSyncHandler.syncGuild()` 재사용). 재sync 자체가 실패해도
 *   재귀하지 않고 error 로그 후 일 1회 대사 크론(`30 4 * * *`) 대기.
 * - `guildDelete`는 두 경우 모두 재sync하지 않는다(F-007 — 이탈한 길드를 되살리지 않음).
 *
 * `roleCreate`는 memberCount=0 고정(F-003), `roleUpdate`는 role.members.size 재계산(F-004)이라는
 * 필드 계약도 함께 고정한다.
 */
import type { BotApiClientService } from '@onyu/bot-api-client';
import type { Guild, Role } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotGuildRoleEventHandler } from './bot-guild-role-event.handler';
import type { BotGuildRoleSyncHandler } from './bot-guild-role-sync.handler';

function makeRole(overrides: Record<string, unknown> = {}): Role {
  return {
    id: 'role-1',
    name: '역할',
    permissions: { bitfield: 8n },
    color: 0,
    position: 1,
    hoist: false,
    mentionable: false,
    managed: false,
    tags: null,
    members: { size: 0 },
    guild: { id: 'guild-1' },
    ...overrides,
  } as unknown as Role;
}

function makeGuild(id = 'guild-1'): Guild {
  return { id } as unknown as Guild;
}

describe('BotGuildRoleEventHandler', () => {
  let handler: BotGuildRoleEventHandler;
  let apiClient: {
    upsertGuildRole: Mock;
    markGuildRoleDeleted: Mock;
    purgeGuildRoles: Mock;
  };
  let syncHandler: { syncGuild: Mock };
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;
  let loggerLogSpy: ReturnType<typeof vi.spyOn>;
  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    apiClient = {
      upsertGuildRole: vi.fn().mockResolvedValue({ ok: true }),
      markGuildRoleDeleted: vi.fn().mockResolvedValue({ ok: true }),
      purgeGuildRoles: vi.fn().mockResolvedValue({ ok: true, deleted: 0 }),
    };
    syncHandler = { syncGuild: vi.fn().mockResolvedValue(3) };

    handler = new BotGuildRoleEventHandler(
      apiClient as unknown as BotApiClientService,
      syncHandler as unknown as BotGuildRoleSyncHandler,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loggerErrorSpy = vi.spyOn((handler as any).logger, 'error').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loggerLogSpy = vi.spyOn((handler as any).logger, 'log').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loggerWarnSpy = vi.spyOn((handler as any).logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('roleCreate — F-GUILD-ROLE-003', () => {
    it('신규 역할을 memberCount=0으로 고정해 upsertGuildRole을 호출한다', async () => {
      const role = makeRole({ id: 'role-new', name: '새 역할', members: { size: 999 } });

      await handler.handleRoleCreate(role);

      expect(apiClient.upsertGuildRole).toHaveBeenCalledWith(
        expect.objectContaining({ guildId: 'guild-1', roleId: 'role-new', memberCount: 0 }),
      );
    });

    it('API 호출이 실패해도 예외를 던지지 않고 에러 로그만 남긴다(throw 경로 — 재동기화하지 않는다)', async () => {
      apiClient.upsertGuildRole.mockRejectedValue(new Error('bot-api 500'));

      await expect(handler.handleRoleCreate(makeRole())).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalled();
      expect(syncHandler.syncGuild).not.toHaveBeenCalled();
    });

    it('GR-③-01: 응답이 {ok:false}면 role.guild로 길드 전량 재동기화를 정확히 1회 수행한다', async () => {
      apiClient.upsertGuildRole.mockResolvedValue({ ok: false });
      const role = makeRole({ guild: { id: 'guild-create' } });

      await handler.handleRoleCreate(role);

      expect(syncHandler.syncGuild).toHaveBeenCalledTimes(1);
      expect(syncHandler.syncGuild).toHaveBeenCalledWith(role.guild);
      expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    });

    it('GR-③-04: 응답이 {ok:true}면 재동기화하지 않는다(정상 경로에 부하를 얹지 않음)', async () => {
      apiClient.upsertGuildRole.mockResolvedValue({ ok: true });

      await handler.handleRoleCreate(makeRole());

      expect(syncHandler.syncGuild).not.toHaveBeenCalled();
    });

    it('GR-③-08 (회귀): 응답에 ok 필드 자체가 없어도(프록시/컨트롤러 드리프트) 재동기화한다', async () => {
      // apiClient 목은 `Mock`(vitest) 타입이라 반환 타입이 강제되지 않는다 — 프로덕션 타입
      // `{ ok: boolean }` 상으로는 불가능한 값이지만, 그 불가능해야 할 값이 런타임에 실제로
      // 관측된 적이 있어(2026-08-25 nginx 사례) `as` 단언 없이 이 회귀를 고정한다.
      apiClient.upsertGuildRole.mockResolvedValue({});

      await handler.handleRoleCreate(makeRole());

      expect(syncHandler.syncGuild).toHaveBeenCalledTimes(1);
    });
  });

  describe('roleUpdate — F-GUILD-ROLE-004', () => {
    it('변경분 판별 없이 전체 컬럼을 재기입하며 memberCount는 newRole.members.size를 사용한다', async () => {
      const oldRole = makeRole({ id: 'role-1', name: '이전 이름' });
      const newRole = makeRole({ id: 'role-1', name: '새 이름', members: { size: 7 } });

      await handler.handleRoleUpdate(oldRole, newRole);

      expect(apiClient.upsertGuildRole).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-1',
          roleId: 'role-1',
          name: '새 이름',
          memberCount: 7,
        }),
      );
    });

    it('API 호출이 실패해도 예외를 던지지 않고 에러 로그만 남긴다(throw 경로 — 재동기화하지 않는다)', async () => {
      apiClient.upsertGuildRole.mockRejectedValue(new Error('bot-api 500'));

      await expect(handler.handleRoleUpdate(makeRole(), makeRole())).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalled();
      expect(syncHandler.syncGuild).not.toHaveBeenCalled();
    });

    it('GR-③-02: 응답이 {ok:false}면 newRole.guild로 재동기화한다(oldRole의 guild가 아님)', async () => {
      apiClient.upsertGuildRole.mockResolvedValue({ ok: false });
      const oldRole = makeRole({ guild: { id: 'guild-old' } });
      const newRole = makeRole({ guild: { id: 'guild-new' } });

      await handler.handleRoleUpdate(oldRole, newRole);

      expect(syncHandler.syncGuild).toHaveBeenCalledTimes(1);
      expect(syncHandler.syncGuild).toHaveBeenCalledWith(newRole.guild);
    });
  });

  describe('roleDelete — F-GUILD-ROLE-005', () => {
    it('소프트 삭제 마킹(markGuildRoleDeleted)을 guildId/roleId로 호출한다', async () => {
      const role = makeRole({ id: 'role-to-delete', guild: { id: 'guild-9' } });

      await handler.handleRoleDelete(role);

      expect(apiClient.markGuildRoleDeleted).toHaveBeenCalledWith({
        guildId: 'guild-9',
        roleId: 'role-to-delete',
      });
    });

    it('API 호출이 실패해도 예외를 던지지 않고 에러 로그만 남긴다(throw 경로 — 재동기화하지 않는다)', async () => {
      apiClient.markGuildRoleDeleted.mockRejectedValue(new Error('bot-api 500'));

      await expect(handler.handleRoleDelete(makeRole())).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalled();
      expect(syncHandler.syncGuild).not.toHaveBeenCalled();
    });

    it('GR-③-03: 응답이 {ok:false}면 role.guild로 재동기화한다', async () => {
      apiClient.markGuildRoleDeleted.mockResolvedValue({ ok: false });
      const role = makeRole({ guild: { id: 'guild-del' } });

      await handler.handleRoleDelete(role);

      expect(syncHandler.syncGuild).toHaveBeenCalledTimes(1);
      expect(syncHandler.syncGuild).toHaveBeenCalledWith(role.guild);
    });
  });

  describe('자가치유 재귀·증폭 방지 계약', () => {
    it('GR-③-05: {ok:false} 후 syncGuild가 reject해도 예외를 던지지 않고 재시도하지 않는다', async () => {
      apiClient.upsertGuildRole.mockResolvedValue({ ok: false });
      syncHandler.syncGuild.mockRejectedValue(new Error('sync failed'));

      await expect(handler.handleRoleCreate(makeRole())).resolves.toBeUndefined();

      expect(syncHandler.syncGuild).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('GR-③-06: 같은 길드에 {ok:false} 이벤트가 재동기화 진행 중 연속 투입되면 syncGuild 호출이 1회로 병합된다', async () => {
      apiClient.upsertGuildRole.mockResolvedValue({ ok: false });
      let resolveSync: (value: number) => void = () => undefined;
      syncHandler.syncGuild.mockImplementation(
        () =>
          new Promise<number>((resolve) => {
            resolveSync = resolve;
          }),
      );
      const role = makeRole({ guild: { id: 'guild-concurrent' } });

      const first = handler.handleRoleCreate(role);
      const second = handler.handleRoleCreate(role);

      // upsertGuildRole의 await 응답 마이크로태스크가 흘러 resyncGuild 진입까지 진행되게 한다.
      await Promise.resolve();
      await Promise.resolve();

      expect(syncHandler.syncGuild).toHaveBeenCalledTimes(1);

      resolveSync(3);
      await Promise.all([first, second]);

      expect(syncHandler.syncGuild).toHaveBeenCalledTimes(1);
    });
  });

  describe('guildDelete — F-GUILD-ROLE-007 (usage-analytics와 독립, Endpoint Spec §5-1)', () => {
    it('purgeGuildRoles를 guildId로 호출하고 삭제 건수를 로그로 남긴다', async () => {
      apiClient.purgeGuildRoles.mockResolvedValue({ ok: true, deleted: 12 });
      const guild = makeGuild('guild-leaving');

      await handler.handleGuildDelete(guild);

      expect(apiClient.purgeGuildRoles).toHaveBeenCalledWith({ guildId: 'guild-leaving' });
      expect(loggerLogSpy).toHaveBeenCalledWith(expect.stringContaining('12'));
    });

    it('API 호출이 실패해도 예외를 던지지 않고 에러 로그만 남긴다(재시도 없음, F-007 제약)', async () => {
      apiClient.purgeGuildRoles.mockRejectedValue(new Error('bot-api 500'));

      await expect(handler.handleGuildDelete(makeGuild())).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalled();
      expect(syncHandler.syncGuild).not.toHaveBeenCalled();
    });

    it('GR-③-07: purgeGuildRoles가 {ok:false}여도 재동기화하지 않는다(이탈한 길드를 되살리지 않음, F-007)', async () => {
      apiClient.purgeGuildRoles.mockResolvedValue({ ok: false, deleted: 0 });

      await handler.handleGuildDelete(makeGuild('guild-leaving'));

      expect(syncHandler.syncGuild).not.toHaveBeenCalled();
    });
  });
});
