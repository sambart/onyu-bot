/**
 * BotDirectoryStatsScheduler 단위 테스트 — koreanbots.dev stats 전송 오케스트레이션.
 * 대상: 포스터 비활성(토큰 부재) skip, Discord client 미준비 skip, 정상 push 시 인자 조립.
 */
import { Logger } from '@nestjs/common';
import type { Client, Collection, Guild } from 'discord.js';
import type { Mock } from 'vitest';

import type { KoreanbotsStatsPosterService } from '../monitoring/koreanbots-stats/koreanbots-stats-poster.service';
import { BotDirectoryStatsScheduler } from './bot-directory-stats.scheduler';

const BOT_ID = '123456789012345678';

interface TestContext {
  client: {
    isReady: Mock;
    user: { id: string } | null;
    guilds: { cache: Collection<string, Guild> };
  };
  koreanbotsPoster: { isEnabled: boolean; postStats: Mock };
  scheduler: BotDirectoryStatsScheduler;
  debugSpy: ReturnType<typeof vi.spyOn>;
}

function makeGuildMap(count: number): Collection<string, Guild> {
  const entries = Array.from({ length: count }, (_, i) => [String(i), {} as Guild] as const);
  return new Map(entries) as unknown as Collection<string, Guild>;
}

function setup(options: { isEnabled: boolean; isReady: boolean; guildCount: number }): TestContext {
  const client = {
    isReady: vi.fn().mockReturnValue(options.isReady),
    user: options.isReady ? { id: BOT_ID } : null,
    guilds: { cache: makeGuildMap(options.guildCount) },
  };
  const koreanbotsPoster = {
    isEnabled: options.isEnabled,
    postStats: vi.fn().mockResolvedValue(undefined),
  };
  const debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined as never);
  const scheduler = new BotDirectoryStatsScheduler(
    client as unknown as Client,
    koreanbotsPoster as unknown as KoreanbotsStatsPosterService,
  );
  return { client, koreanbotsPoster, scheduler, debugSpy };
}

describe('BotDirectoryStatsScheduler — 포스터 비활성(KOREANBOTS_TOKEN 부재) skip', () => {
  it('handleReady() 호출 시 postStats를 호출하지 않는다', async () => {
    const ctx = setup({ isEnabled: false, isReady: true, guildCount: 5 });

    await ctx.scheduler.handleReady();

    expect(ctx.koreanbotsPoster.postStats).not.toHaveBeenCalled();
  });

  it('handleInterval() 호출 시 postStats를 호출하지 않는다', async () => {
    const ctx = setup({ isEnabled: false, isReady: true, guildCount: 5 });

    await ctx.scheduler.handleInterval();

    expect(ctx.koreanbotsPoster.postStats).not.toHaveBeenCalled();
  });
});

describe('BotDirectoryStatsScheduler — Discord client 미준비 skip', () => {
  it('client.isReady()가 false면 postStats를 호출하지 않는다', async () => {
    const ctx = setup({ isEnabled: true, isReady: false, guildCount: 5 });

    await ctx.scheduler.handleReady();

    expect(ctx.koreanbotsPoster.postStats).not.toHaveBeenCalled();
  });
});

describe('BotDirectoryStatsScheduler — 정상 push', () => {
  it('client.user.id/guilds.cache.size/샤드 수 1을 postStats에 전달한다', async () => {
    const GUILD_COUNT = 7;
    const ctx = setup({ isEnabled: true, isReady: true, guildCount: GUILD_COUNT });

    await ctx.scheduler.handleReady();

    expect(ctx.koreanbotsPoster.postStats).toHaveBeenCalledWith(BOT_ID, GUILD_COUNT, 1);
  });

  it('handleInterval() 호출 시에도 동일하게 postStats를 호출한다', async () => {
    const GUILD_COUNT = 3;
    const ctx = setup({ isEnabled: true, isReady: true, guildCount: GUILD_COUNT });

    await ctx.scheduler.handleInterval();

    expect(ctx.koreanbotsPoster.postStats).toHaveBeenCalledWith(BOT_ID, GUILD_COUNT, 1);
  });
});
