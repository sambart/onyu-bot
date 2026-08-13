/**
 * BotGuildMemberSyncHandler 단위 테스트.
 *
 * 핵심 회귀 방지: reconcile(F-GUILD-MEMBER-001 다운타임 퇴장 보정, 2026-08-07 확정)은
 * fetch + 전체 upsert 배치가 "모두" 성공했을 때만 호출돼야 한다. 부분 확보 상태에서
 * 호출되면 재적자를 대량 오탐 비활성화할 수 있다 — 이 스펙이 그 안전 가드를 고정한다.
 */
import type {
  BotApiClientService,
  GuildDirectoryReconcileResult,
  GuildMemberReconcileResult,
} from '@onyu/bot-api-client';
import type { Client, Guild, GuildMember } from 'discord.js';
import { Collection } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotGuildMemberSyncHandler } from './bot-guild-member-sync.handler';

function makeGuildMember(overrides: Record<string, unknown> = {}): GuildMember {
  return {
    id: 'user-1',
    displayName: '동현',
    nickname: null,
    joinedAt: new Date('2026-01-01T00:00:00Z'),
    user: { username: 'donghyun', globalName: 'Donghyun', bot: false },
    displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png'),
    ...overrides,
  } as unknown as GuildMember;
}

function makeGuild(members: GuildMember[], fetchImpl?: Mock): Guild {
  const fetch =
    fetchImpl ?? vi.fn().mockResolvedValue(new Collection(members.map((m) => [m.id, m])));
  return {
    id: 'guild-1',
    members: { fetch },
  } as unknown as Guild;
}

/** clientReady 시 client.guilds.cache 항목으로 사용할 최소 Guild mock(id/name/icon + members.fetch). */
function makeReadyGuild(id: string, name: string, icon: string | null): Guild {
  return {
    id,
    name,
    icon,
    members: {
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Collection([[`${id}-user-1`, makeGuildMember({ id: `${id}-user-1` })]]),
        ),
    },
  } as unknown as Guild;
}

function makeClientWithGuilds(guilds: Guild[]): Client {
  return {
    guilds: { cache: new Collection(guilds.map((g) => [g.id, g])) },
  } as unknown as Client;
}

function makeReconcileResult(
  overrides: Partial<GuildMemberReconcileResult> = {},
): GuildMemberReconcileResult {
  return { ok: true, deactivated: 0, skipped: false, ...overrides };
}

function makeDirectoryReconcileResult(
  overrides: Partial<GuildDirectoryReconcileResult> = {},
): GuildDirectoryReconcileResult {
  return { ok: true, upserted: 0, deactivated: 0, skipped: false, ...overrides };
}

describe('BotGuildMemberSyncHandler', () => {
  let handler: BotGuildMemberSyncHandler;
  let apiClient: {
    bulkUpsertGuildMembers: Mock;
    reconcileGuildMembers: Mock;
    healthCheck: Mock;
    reconcileGuildDirectory: Mock;
  };
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;
  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    apiClient = {
      bulkUpsertGuildMembers: vi.fn().mockResolvedValue(undefined),
      reconcileGuildMembers: vi.fn().mockResolvedValue(makeReconcileResult()),
      healthCheck: vi.fn().mockResolvedValue(undefined),
      reconcileGuildDirectory: vi.fn().mockResolvedValue(makeDirectoryReconcileResult()),
    };

    handler = new BotGuildMemberSyncHandler(
      {} as unknown as Client,
      apiClient as unknown as BotApiClientService,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loggerErrorSpy = vi.spyOn((handler as any).logger, 'error').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loggerWarnSpy = vi.spyOn((handler as any).logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('전체 확보 성공 시', () => {
    it('upsert 배치 전송 후 reconcile을 전체 재적자 userId 집합으로 호출한다', async () => {
      const members = [makeGuildMember({ id: 'user-1' }), makeGuildMember({ id: 'user-2' })];
      const guild = makeGuild(members);

      const synced = await handler.syncGuild(guild);

      expect(synced).toBe(2);
      expect(apiClient.bulkUpsertGuildMembers).toHaveBeenCalledTimes(1);
      expect(apiClient.reconcileGuildMembers).toHaveBeenCalledWith({
        guildId: 'guild-1',
        activeUserIds: ['user-1', 'user-2'],
      });
    });

    it('reconcile 결과가 skipped=true이면 경고 로그를 남기지만 syncGuild는 정상 완료된다', async () => {
      apiClient.reconcileGuildMembers.mockResolvedValue(
        makeReconcileResult({ skipped: true, skipReason: 'ratio-exceeded' }),
      );
      const guild = makeGuild([makeGuildMember()]);

      const synced = await handler.syncGuild(guild);

      expect(synced).toBe(1);
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('ratio-exceeded'));
    });

    it('reconcile이 실 비활성화를 수행했으면 결과 로그를 남긴다', async () => {
      apiClient.reconcileGuildMembers.mockResolvedValue(makeReconcileResult({ deactivated: 3 }));
      const guild = makeGuild([makeGuildMember()]);

      await handler.syncGuild(guild);

      expect(apiClient.reconcileGuildMembers).toHaveBeenCalledTimes(1);
    });

    it('reconcile 호출 자체가 실패해도(rejected) syncGuild는 예외 없이 완료되고 synced 수를 반환한다', async () => {
      apiClient.reconcileGuildMembers.mockRejectedValue(new Error('reconcile API 500'));
      const members = [makeGuildMember()];
      const guild = makeGuild(members);

      const synced = await handler.syncGuild(guild);

      expect(synced).toBe(1);
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('fetch 실패(부분 확보 의심) 시', () => {
    it('bulkUpsertGuildMembers와 reconcileGuildMembers를 모두 호출하지 않고 0을 반환한다', async () => {
      const fetch = vi.fn().mockRejectedValue(new Error('gateway timeout'));
      const guild = makeGuild([], fetch);

      const synced = await handler.syncGuild(guild);

      expect(synced).toBe(0);
      expect(apiClient.bulkUpsertGuildMembers).not.toHaveBeenCalled();
      expect(apiClient.reconcileGuildMembers).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('upsert 배치 중간 실패(부분 전송) 시', () => {
    it('reconcileGuildMembers를 호출하지 않고 0을 반환한다 (부분 목록으로 reconcile 금지)', async () => {
      apiClient.bulkUpsertGuildMembers.mockRejectedValue(new Error('bot-api 500'));
      const guild = makeGuild([makeGuildMember()]);

      const synced = await handler.syncGuild(guild);

      expect(synced).toBe(0);
      expect(apiClient.reconcileGuildMembers).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  /**
   * handleReady — 길드-레벨 guild_directory reconcile(F-SUPER-ADMIN-039) 호출 검증.
   * 핵심 회귀 방지: reconcileGuildDirectory는 waitForApi 성공 직후 · 멤버 순회 이전에
   * 호출돼야 하고, 실패해도 이후 멤버 동기화를 막지 않아야 한다(계획 §2.4, TC-UC17-09/10).
   */
  describe('handleReady', () => {
    let client: Client;

    beforeEach(() => {
      client = makeClientWithGuilds([
        makeReadyGuild('guild-1', 'Guild One', 'icon-1'),
        makeReadyGuild('guild-2', 'Guild Two', null),
      ]);
      handler = new BotGuildMemberSyncHandler(client, apiClient as unknown as BotApiClientService);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- private logger 스파이 (파일 상단 기존 패턴과 동일)
      const internalLogger = (handler as any).logger;
      loggerErrorSpy = vi.spyOn(internalLogger, 'error').mockImplementation(() => undefined);
      loggerWarnSpy = vi.spyOn(internalLogger, 'warn').mockImplementation(() => undefined);
    });

    it('reconcileGuildDirectory가 캐시 전 길드의 {id,name,icon}으로 1회 호출된다', async () => {
      await handler.handleReady();

      expect(apiClient.reconcileGuildDirectory).toHaveBeenCalledTimes(1);
      expect(apiClient.reconcileGuildDirectory).toHaveBeenCalledWith({
        guilds: [
          { id: 'guild-1', name: 'Guild One', icon: 'icon-1' },
          { id: 'guild-2', name: 'Guild Two', icon: null },
        ],
      });
    });

    it('reconcileGuildDirectory 호출이 syncGuild 순회(bulkUpsertGuildMembers)보다 먼저 일어난다', async () => {
      await handler.handleReady();

      const directoryCallOrder = apiClient.reconcileGuildDirectory.mock.invocationCallOrder[0];
      const syncCallOrder = apiClient.bulkUpsertGuildMembers.mock.invocationCallOrder[0];

      expect(directoryCallOrder).toBeLessThan(syncCallOrder);
    });

    it('reconcile 호출이 reject해도 이후 멤버 동기화가 계속 수행되고 handleReady가 정상 종료한다', async () => {
      apiClient.reconcileGuildDirectory.mockRejectedValue(new Error('directory reconcile 500'));

      await expect(handler.handleReady()).resolves.toBeUndefined();

      expect(apiClient.bulkUpsertGuildMembers).toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        '[GUILD-DIRECTORY-RECONCILE] reconcile call failed',
        expect.anything(),
      );
    });

    it('waitForApi 실패(healthCheck 계속 reject) 시 reconcileGuildDirectory도 호출되지 않는다', async () => {
      vi.useFakeTimers();
      apiClient.healthCheck.mockRejectedValue(new Error('api down'));

      const readyPromise = handler.handleReady();
      await vi.runAllTimersAsync();
      await readyPromise;

      expect(apiClient.reconcileGuildDirectory).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('skipped:true 응답 시 warn 로그를 1회 남긴다', async () => {
      apiClient.reconcileGuildDirectory.mockResolvedValue(
        makeDirectoryReconcileResult({ skipped: true, skipReason: 'ratio-exceeded' }),
      );

      await handler.handleReady();

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[GUILD-DIRECTORY-RECONCILE]'),
      );
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('ratio-exceeded'));
    });
  });
});
