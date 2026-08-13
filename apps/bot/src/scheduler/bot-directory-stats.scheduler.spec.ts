/**
 * BotDirectoryStatsScheduler 단위 테스트 — koreanbots.dev/top.gg stats 전송 오케스트레이션.
 * 대상: 양쪽 포스터 비활성(토큰 부재) skip, Discord client 미준비 skip, 정상 push 시 인자 조립,
 * 한쪽 포스터만 활성일 때의 병렬 호출.
 */
import { Logger } from '@nestjs/common';
import type { Client, Collection, Guild } from 'discord.js';
import type { Mock } from 'vitest';

import type { KoreanbotsStatsPosterService } from '../monitoring/koreanbots-stats/koreanbots-stats-poster.service';
import type { TopggStatsPosterService } from '../monitoring/topgg-stats/topgg-stats-poster.service';
import { BotDirectoryStatsScheduler } from './bot-directory-stats.scheduler';

const BOT_ID = '123456789012345678';

interface TestContext {
  client: {
    isReady: Mock;
    user: { id: string } | null;
    guilds: { cache: Collection<string, Guild> };
  };
  koreanbotsPoster: { isEnabled: boolean; postStats: Mock };
  topggPoster: { isEnabled: boolean; postStats: Mock };
  scheduler: BotDirectoryStatsScheduler;
  debugSpy: ReturnType<typeof vi.spyOn>;
}

function makeGuildMap(count: number): Collection<string, Guild> {
  const entries = Array.from({ length: count }, (_, i) => [String(i), {} as Guild] as const);
  return new Map(entries) as unknown as Collection<string, Guild>;
}

function setup(options: {
  isKoreanbotsEnabled: boolean;
  isTopggEnabled: boolean;
  isReady: boolean;
  guildCount: number;
}): TestContext {
  const client = {
    isReady: vi.fn().mockReturnValue(options.isReady),
    user: options.isReady ? { id: BOT_ID } : null,
    guilds: { cache: makeGuildMap(options.guildCount) },
  };
  const koreanbotsPoster = {
    isEnabled: options.isKoreanbotsEnabled,
    postStats: vi.fn().mockResolvedValue(undefined),
  };
  const topggPoster = {
    isEnabled: options.isTopggEnabled,
    postStats: vi.fn().mockResolvedValue(undefined),
  };
  const debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined as never);
  const scheduler = new BotDirectoryStatsScheduler(
    client as unknown as Client,
    koreanbotsPoster as unknown as KoreanbotsStatsPosterService,
    topggPoster as unknown as TopggStatsPosterService,
  );
  return { client, koreanbotsPoster, topggPoster, scheduler, debugSpy };
}

describe('BotDirectoryStatsScheduler — 양쪽 포스터 비활성(토큰 부재) skip', () => {
  it('handleReady() 호출 시 어느 포스터의 postStats도 호출하지 않는다', async () => {
    const ctx = setup({
      isKoreanbotsEnabled: false,
      isTopggEnabled: false,
      isReady: true,
      guildCount: 5,
    });

    await ctx.scheduler.handleReady();

    expect(ctx.koreanbotsPoster.postStats).not.toHaveBeenCalled();
    expect(ctx.topggPoster.postStats).not.toHaveBeenCalled();
  });

  it('handleInterval() 호출 시 어느 포스터의 postStats도 호출하지 않는다', async () => {
    const ctx = setup({
      isKoreanbotsEnabled: false,
      isTopggEnabled: false,
      isReady: true,
      guildCount: 5,
    });

    await ctx.scheduler.handleInterval();

    expect(ctx.koreanbotsPoster.postStats).not.toHaveBeenCalled();
    expect(ctx.topggPoster.postStats).not.toHaveBeenCalled();
  });
});

describe('BotDirectoryStatsScheduler — Discord client 미준비 skip', () => {
  it('client.isReady()가 false면 어느 포스터의 postStats도 호출하지 않는다', async () => {
    const ctx = setup({
      isKoreanbotsEnabled: true,
      isTopggEnabled: true,
      isReady: false,
      guildCount: 5,
    });

    await ctx.scheduler.handleReady();

    expect(ctx.koreanbotsPoster.postStats).not.toHaveBeenCalled();
    expect(ctx.topggPoster.postStats).not.toHaveBeenCalled();
  });
});

describe('BotDirectoryStatsScheduler — 정상 push', () => {
  it('client.user.id/guilds.cache.size/샤드 수 1을 koreanbotsPoster.postStats에 전달한다', async () => {
    const GUILD_COUNT = 7;
    const ctx = setup({
      isKoreanbotsEnabled: true,
      isTopggEnabled: true,
      isReady: true,
      guildCount: GUILD_COUNT,
    });

    await ctx.scheduler.handleReady();

    expect(ctx.koreanbotsPoster.postStats).toHaveBeenCalledWith(BOT_ID, GUILD_COUNT, 1);
  });

  it('client.user.id/guilds.cache.size를 topggPoster.postStats에 전달한다', async () => {
    const GUILD_COUNT = 7;
    const ctx = setup({
      isKoreanbotsEnabled: true,
      isTopggEnabled: true,
      isReady: true,
      guildCount: GUILD_COUNT,
    });

    await ctx.scheduler.handleReady();

    expect(ctx.topggPoster.postStats).toHaveBeenCalledWith(BOT_ID, GUILD_COUNT);
  });

  it('handleInterval() 호출 시에도 양쪽 포스터에 동일하게 postStats를 호출한다', async () => {
    const GUILD_COUNT = 3;
    const ctx = setup({
      isKoreanbotsEnabled: true,
      isTopggEnabled: true,
      isReady: true,
      guildCount: GUILD_COUNT,
    });

    await ctx.scheduler.handleInterval();

    expect(ctx.koreanbotsPoster.postStats).toHaveBeenCalledWith(BOT_ID, GUILD_COUNT, 1);
    expect(ctx.topggPoster.postStats).toHaveBeenCalledWith(BOT_ID, GUILD_COUNT);
  });

  it('koreanbots만 활성이어도 push를 진행하며 양쪽 postStats를 모두 호출한다(개별 no-op은 포스터 내부 책임)', async () => {
    const GUILD_COUNT = 4;
    const ctx = setup({
      isKoreanbotsEnabled: true,
      isTopggEnabled: false,
      isReady: true,
      guildCount: GUILD_COUNT,
    });

    await ctx.scheduler.handleReady();

    expect(ctx.koreanbotsPoster.postStats).toHaveBeenCalledWith(BOT_ID, GUILD_COUNT, 1);
    expect(ctx.topggPoster.postStats).toHaveBeenCalledWith(BOT_ID, GUILD_COUNT);
  });

  it('top.gg만 활성이어도 push를 진행하며 양쪽 postStats를 모두 호출한다(개별 no-op은 포스터 내부 책임)', async () => {
    const GUILD_COUNT = 4;
    const ctx = setup({
      isKoreanbotsEnabled: false,
      isTopggEnabled: true,
      isReady: true,
      guildCount: GUILD_COUNT,
    });

    await ctx.scheduler.handleReady();

    expect(ctx.koreanbotsPoster.postStats).toHaveBeenCalledWith(BOT_ID, GUILD_COUNT, 1);
    expect(ctx.topggPoster.postStats).toHaveBeenCalledWith(BOT_ID, GUILD_COUNT);
  });
});
