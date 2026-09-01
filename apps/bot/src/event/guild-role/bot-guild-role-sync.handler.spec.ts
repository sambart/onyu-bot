/**
 * BotGuildRoleSyncHandler 단위 테스트.
 *
 * 핵심 회귀 방지: `guild.roles.fetch()`가 실패하면 부분 목록으로 E1(sync)을 호출해서는
 * 안 된다(§2-3 ① 층, EC-GR-20·21 P0) — 이 스펙이 그 안전 가드를 고정한다.
 * `bot-guild-member-sync.handler.spec.ts`의 mock/구조 관례를 그대로 따른다.
 */
import type { BotApiClientService, GuildRoleSyncResult } from '@onyu/bot-api-client';
import type { Client, Guild, Role } from 'discord.js';
import { Collection } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotGuildRoleSyncHandler } from './bot-guild-role-sync.handler';

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
    ...overrides,
  } as unknown as Role;
}

function makeGuild(roles: Role[], fetchImpl?: Mock, guildId = 'guild-1'): Guild {
  const fetch = fetchImpl ?? vi.fn().mockResolvedValue(new Collection(roles.map((r) => [r.id, r])));
  return {
    id: guildId,
    roles: { fetch },
  } as unknown as Guild;
}

function makeClientWithGuilds(guilds: Guild[]): Client {
  return {
    guilds: { cache: new Collection(guilds.map((g) => [g.id, g])) },
  } as unknown as Client;
}

function makeSyncResult(overrides: Partial<GuildRoleSyncResult> = {}): GuildRoleSyncResult {
  return { ok: true, upserted: 0, markedDeleted: 0, skipped: false, ...overrides };
}

describe('BotGuildRoleSyncHandler', () => {
  let handler: BotGuildRoleSyncHandler;
  let apiClient: { syncGuildRoles: Mock; healthCheck: Mock };
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;
  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;
  let loggerLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    apiClient = {
      syncGuildRoles: vi.fn().mockResolvedValue(makeSyncResult()),
      healthCheck: vi.fn().mockResolvedValue(undefined),
    };

    handler = new BotGuildRoleSyncHandler(
      {} as unknown as Client,
      apiClient as unknown as BotApiClientService,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loggerErrorSpy = vi.spyOn((handler as any).logger, 'error').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loggerWarnSpy = vi.spyOn((handler as any).logger, 'warn').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loggerLogSpy = vi.spyOn((handler as any).logger, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('syncGuild — fetch 성공 시', () => {
    it('fetch한 역할 전체를 payload로 매핑해 syncGuildRoles를 1회 호출하고 역할 수를 반환한다', async () => {
      const roles = [
        makeRole({ id: 'role-1', name: '관리자', permissions: { bitfield: 8n } }),
        makeRole({ id: 'role-2', name: '멤버', permissions: { bitfield: 0n } }),
      ];
      const guild = makeGuild(roles);

      const synced = await handler.syncGuild(guild);

      expect(synced).toBe(2);
      expect(apiClient.syncGuildRoles).toHaveBeenCalledTimes(1);
      expect(apiClient.syncGuildRoles).toHaveBeenCalledWith({
        guildId: 'guild-1',
        roles: [
          expect.objectContaining({ roleId: 'role-1', name: '관리자', permissions: '8' }),
          expect.objectContaining({ roleId: 'role-2', name: '멤버', permissions: '0' }),
        ],
      });
    });

    it('@everyone(roleId===guildId) 역할도 필터링하지 않고 payload에 포함한다(EC-GR-28 P0)', async () => {
      const everyoneRole = makeRole({ id: 'guild-1', name: '@everyone' });
      const guild = makeGuild([everyoneRole]);

      await handler.syncGuild(guild);

      expect(apiClient.syncGuildRoles).toHaveBeenCalledWith({
        guildId: 'guild-1',
        roles: [expect.objectContaining({ roleId: 'guild-1', name: '@everyone' })],
      });
    });

    it('role.managed=true → isManaged=true로, role.tags!=null → hasTags=true로 매핑한다(EC-GR-35)', async () => {
      const role = makeRole({ id: 'role-managed', managed: true, tags: { botId: 'bot-1' } });
      const guild = makeGuild([role]);

      await handler.syncGuild(guild);

      expect(apiClient.syncGuildRoles).toHaveBeenCalledWith({
        guildId: 'guild-1',
        roles: [expect.objectContaining({ isManaged: true, hasTags: true })],
      });
    });

    it('memberCount는 role.members.size를 그대로 사용한다(선행 fetch 없음, Q4 확정)', async () => {
      const role = makeRole({ id: 'role-1', members: { size: 42 } });
      const guild = makeGuild([role]);

      await handler.syncGuild(guild);

      expect(apiClient.syncGuildRoles).toHaveBeenCalledWith({
        guildId: 'guild-1',
        roles: [expect.objectContaining({ memberCount: 42 })],
      });
    });

    it('64비트 권한 bitfield를 안전정수 손실 없이 10진 문자열로 변환한다', async () => {
      const role = makeRole({ id: 'role-1', permissions: { bitfield: 9223372036854775807n } });
      const guild = makeGuild([role]);

      await handler.syncGuild(guild);

      expect(apiClient.syncGuildRoles).toHaveBeenCalledWith({
        guildId: 'guild-1',
        roles: [expect.objectContaining({ permissions: '9223372036854775807' })],
      });
    });

    it('result.skipped=true이면 skipReason을 포함한 경고 로그를 남긴다', async () => {
      apiClient.syncGuildRoles.mockResolvedValue(
        makeSyncResult({ skipped: true, skipReason: 'ratio-exceeded' }),
      );
      const guild = makeGuild([makeRole()]);

      await handler.syncGuild(guild);

      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('ratio-exceeded'));
    });

    it('result.markedDeleted > 0이면 정보 로그를 남긴다', async () => {
      apiClient.syncGuildRoles.mockResolvedValue(makeSyncResult({ markedDeleted: 3 }));
      const guild = makeGuild([makeRole()]);

      await handler.syncGuild(guild);

      expect(loggerLogSpy).toHaveBeenCalledWith(expect.stringContaining('3'));
    });
  });

  describe('syncGuild — fetch 실패 시(부분 목록 방지, §2-3 ① 층)', () => {
    it('syncGuildRoles(E1)를 호출하지 않고 0을 반환한다(EC-GR-20 P0)', async () => {
      const fetch = vi.fn().mockRejectedValue(new Error('gateway timeout'));
      const guild = makeGuild([], fetch);

      const synced = await handler.syncGuild(guild);

      expect(synced).toBe(0);
      expect(apiClient.syncGuildRoles).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('syncGuild — API 호출 자체가 실패 시', () => {
    it('syncGuildRoles가 reject해도 예외 없이 0을 반환하고 에러 로그를 남긴다', async () => {
      apiClient.syncGuildRoles.mockRejectedValue(new Error('bot-api 500'));
      const guild = makeGuild([makeRole()]);

      const synced = await handler.syncGuild(guild);

      expect(synced).toBe(0);
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('handleReady — waitForApi 게이트(EC-GR-22 P0)', () => {
    it('API 연결 성공 시 캐시된 모든 길드를 순회하며 syncGuild를 호출한다', async () => {
      const guildA = makeGuild([makeRole({ id: 'role-a' })], undefined, 'guild-a');
      const guildB = makeGuild([makeRole({ id: 'role-b' })], undefined, 'guild-b');
      const client = makeClientWithGuilds([guildA, guildB]);
      handler = new BotGuildRoleSyncHandler(client, apiClient as unknown as BotApiClientService);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      loggerLogSpy = vi.spyOn((handler as any).logger, 'log').mockImplementation(() => undefined);

      await handler.handleReady();

      expect(apiClient.syncGuildRoles).toHaveBeenCalledTimes(2);
    });

    it('waitForApi 실패(healthCheck 계속 reject) 시 어떤 길드의 syncGuild도 호출하지 않는다', async () => {
      vi.useFakeTimers();
      apiClient.healthCheck.mockRejectedValue(new Error('api down'));
      const guild = makeGuild([makeRole()]);
      const client = makeClientWithGuilds([guild]);
      handler = new BotGuildRoleSyncHandler(client, apiClient as unknown as BotApiClientService);
      // private logger 를 spy 하기 위한 구조 단언 (any 금지 규칙 준수)
      loggerErrorSpy = vi
        .spyOn(
          (handler as unknown as { logger: { error: (...args: unknown[]) => void } }).logger,
          'error',
        )
        .mockImplementation(() => undefined);

      const readyPromise = handler.handleReady();
      await vi.runAllTimersAsync();
      await readyPromise;

      expect(apiClient.syncGuildRoles).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
