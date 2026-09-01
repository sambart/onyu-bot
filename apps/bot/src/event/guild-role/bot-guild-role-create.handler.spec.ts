/**
 * BotGuildRoleCreateHandler 단위 테스트 — guildCreate(F-GUILD-ROLE-002).
 * `syncHandler.syncGuild()`를 그대로 재사용하는지, 실패(0 반환) 시 경고 로그를 남기는지 고정한다.
 */
import type { Guild } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotGuildRoleCreateHandler } from './bot-guild-role-create.handler';
import type { BotGuildRoleSyncHandler } from './bot-guild-role-sync.handler';

describe('BotGuildRoleCreateHandler', () => {
  let handler: BotGuildRoleCreateHandler;
  let syncHandler: { syncGuild: Mock };
  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    syncHandler = { syncGuild: vi.fn().mockResolvedValue(3) };
    handler = new BotGuildRoleCreateHandler(syncHandler as unknown as BotGuildRoleSyncHandler);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loggerWarnSpy = vi.spyOn((handler as any).logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('신규 길드에 대해 syncHandler.syncGuild를 호출한다', async () => {
    const guild = { id: 'guild-new' } as unknown as Guild;

    await handler.handleGuildCreate(guild);

    expect(syncHandler.syncGuild).toHaveBeenCalledWith(guild);
  });

  it('syncGuild가 0을 반환하면(fetch 실패 또는 빈 목록) 경고 로그를 남긴다', async () => {
    syncHandler.syncGuild.mockResolvedValue(0);
    const guild = { id: 'guild-new' } as unknown as Guild;

    await handler.handleGuildCreate(guild);

    expect(loggerWarnSpy).toHaveBeenCalled();
  });

  it('syncGuild가 0보다 큰 값을 반환하면 경고 로그를 남기지 않는다', async () => {
    syncHandler.syncGuild.mockResolvedValue(5);
    const guild = { id: 'guild-new' } as unknown as Guild;

    await handler.handleGuildCreate(guild);

    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });
});
