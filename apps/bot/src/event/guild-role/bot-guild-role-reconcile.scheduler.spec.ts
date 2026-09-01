/**
 * BotGuildRoleReconcileScheduler 단위 테스트 — 일 1회 전 길드 대사 크론(F-GUILD-ROLE-006).
 *
 * 핵심 회귀 방지: 순회 도중 이탈한 길드는 `client.guilds.cache.has()` 재확인으로 스킵돼야
 * 하고(DB 설계 지침 #14, EC-GR-16 P0 — guildDelete ↔ 대사 크론 race로 인한 좀비 재삽입 방지),
 * 개별 길드 실패가 나머지 길드 순회를 막지 않아야 한다.
 */
import type { Client, Collection, Guild } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotGuildRoleReconcileScheduler } from './bot-guild-role-reconcile.scheduler';
import type { BotGuildRoleSyncHandler } from './bot-guild-role-sync.handler';

function makeGuild(id: string): Guild {
  return { id } as unknown as Guild;
}

/**
 * `client.guilds.cache`는 discord.js `Collection`(Map 확장)이다 — `has()`를 실제 Map처럼
 * 동작시키되, 특정 guildId만 이탈(삭제)된 상태를 재현할 수 있도록 테스트 전용으로 구성한다.
 */
function makeCacheClient(guildIds: string[], departedDuringIteration: string[] = []): Client {
  const guilds = guildIds.map((id) => makeGuild(id));
  const cacheMap = new Map(guilds.map((g) => [g.id, g]));
  const cache = {
    values: () => cacheMap.values(),
    has: (id: string) => {
      if (departedDuringIteration.includes(id)) {
        cacheMap.delete(id);
        return false;
      }
      return cacheMap.has(id);
    },
  } as unknown as Collection<string, Guild>;

  return { guilds: { cache } } as unknown as Client;
}

describe('BotGuildRoleReconcileScheduler', () => {
  let syncHandler: { syncGuild: Mock };
  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;
  let loggerLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    syncHandler = { syncGuild: vi.fn().mockResolvedValue(2) };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeScheduler(client: Client): BotGuildRoleReconcileScheduler {
    const scheduler = new BotGuildRoleReconcileScheduler(
      client,
      syncHandler as unknown as BotGuildRoleSyncHandler,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loggerWarnSpy = vi.spyOn((scheduler as any).logger, 'warn').mockImplementation(() => undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loggerLogSpy = vi.spyOn((scheduler as any).logger, 'log').mockImplementation(() => undefined);
    return scheduler;
  }

  it('client.guilds.cache의 모든 길드에 대해 syncGuild를 호출한다', async () => {
    const client = makeCacheClient(['guild-1', 'guild-2', 'guild-3']);
    const scheduler = makeScheduler(client);

    await scheduler.reconcileAllGuilds();

    expect(syncHandler.syncGuild).toHaveBeenCalledTimes(3);
  });

  it('순회 직전 재확인에서 이미 이탈(cache.has=false)한 길드는 syncGuild를 호출하지 않고 스킵한다(EC-GR-16 P0)', async () => {
    const client = makeCacheClient(['guild-1', 'guild-2'], ['guild-2']);
    const scheduler = makeScheduler(client);

    await scheduler.reconcileAllGuilds();

    expect(syncHandler.syncGuild).toHaveBeenCalledTimes(1);
    expect(syncHandler.syncGuild).toHaveBeenCalledWith(expect.objectContaining({ id: 'guild-1' }));
    expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('guild-2'));
  });

  it('개별 길드의 syncGuild가 0을 반환해도(fetch 실패) 나머지 길드 순회를 계속한다', async () => {
    syncHandler.syncGuild
      .mockResolvedValueOnce(0) // guild-1: fetch 실패
      .mockResolvedValueOnce(5); // guild-2: 정상
    const client = makeCacheClient(['guild-1', 'guild-2']);
    const scheduler = makeScheduler(client);

    await expect(scheduler.reconcileAllGuilds()).resolves.toBeUndefined();

    expect(syncHandler.syncGuild).toHaveBeenCalledTimes(2);
  });

  it('길드가 하나도 없으면 syncGuild를 호출하지 않고 정상 종료한다', async () => {
    const client = makeCacheClient([]);
    const scheduler = makeScheduler(client);

    await expect(scheduler.reconcileAllGuilds()).resolves.toBeUndefined();

    expect(syncHandler.syncGuild).not.toHaveBeenCalled();
    expect(loggerLogSpy).toHaveBeenCalled();
  });
});
