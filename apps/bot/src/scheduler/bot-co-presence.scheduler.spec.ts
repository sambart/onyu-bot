/**
 * BotCoPresenceScheduler 단위 테스트
 * 대상: tick()이 scannedGuildIds(빈 길드 포함 전체 길드)를 pushCoPresenceSnapshots에
 * 함께 전달하는지 검증 (M-2 — 빈 길드 좀비 세션 방지).
 *
 * Discord.js Collection은 Map을 확장하며 filter()/map() 메서드를 제공한다.
 * 일반 Map은 filter()/map()이 없으므로, 해당 메서드를 지원하는 mock Collection을 직접 구현한다.
 * guilds.cache 자체는 keys()/values() 만 사용되므로 순수 Map으로 충분하다.
 */

import type { Client, Guild, GuildMember, VoiceChannel } from 'discord.js';
import { ChannelType } from 'discord.js';
import type { Mock } from 'vitest';

import { BotCoPresenceScheduler } from './bot-co-presence.scheduler';

// ─── mock Collection 헬퍼 ─────────────────────────────────────────────────────

interface FakeCollection<T> {
  size: number;
  filter: (fn: (item: T) => boolean) => FakeCollection<T>;
  values: () => IterableIterator<T>;
  map: <R>(fn: (item: T) => R) => R[];
}

function makeCollection<T>(items: T[]): FakeCollection<T> {
  return {
    size: items.length,
    filter: (fn) => makeCollection(items.filter(fn)),
    values: () => items.values(),
    map: (fn) => items.map(fn),
  };
}

function makeMember(id: string, isBot = false): GuildMember {
  return {
    id,
    user: { bot: isBot },
    presence: null,
  } as unknown as GuildMember;
}

/** 음성 채널이 있는 길드(멤버 목록 포함) mock */
function makeGuildWithVoiceChannel(guildId: string, memberIds: string[]): Guild {
  const members = makeCollection(memberIds.map((id) => makeMember(id)));
  const voiceChannel = {
    type: ChannelType.GuildVoice,
    id: `${guildId}-ch-1`,
    members,
  } as unknown as VoiceChannel;

  return {
    id: guildId,
    channels: { cache: makeCollection([voiceChannel]) },
    voiceStates: { cache: makeCollection([]) },
  } as unknown as Guild;
}

/** 음성 채널 멤버가 전혀 없는(완전히 빈) 길드 mock */
function makeEmptyGuild(guildId: string): Guild {
  return {
    id: guildId,
    channels: { cache: makeCollection([]) },
    voiceStates: { cache: makeCollection([]) },
  } as unknown as Guild;
}

describe('BotCoPresenceScheduler', () => {
  let apiClient: {
    pushCoPresenceSnapshots: Mock;
    pushVoiceUserCounts: Mock;
    pushCoPresenceFlush: Mock;
  };
  let scheduler: BotCoPresenceScheduler;

  beforeEach(() => {
    apiClient = {
      pushCoPresenceSnapshots: vi.fn().mockResolvedValue(undefined),
      pushVoiceUserCounts: vi.fn().mockResolvedValue(undefined),
      pushCoPresenceFlush: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('M-2: tick이 완전히 빈 길드까지 포함한 전체 길드 ID를 scannedGuildIds로 전달한다', async () => {
    vi.useFakeTimers();

    const guildMap = new Map<string, Guild>([
      ['guild-1', makeGuildWithVoiceChannel('guild-1', ['user-1', 'user-2'])],
      ['guild-2', makeEmptyGuild('guild-2')], // 완전히 빈 길드 — snapshots에는 등장하지 않음
    ]);

    const client = {
      guilds: { cache: guildMap },
    } as unknown as Client;

    scheduler = new BotCoPresenceScheduler(client, apiClient as never);
    scheduler.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(apiClient.pushCoPresenceSnapshots).toHaveBeenCalledTimes(1);
    const [snapshots, scannedGuildIds] = apiClient.pushCoPresenceSnapshots.mock.calls[0] as [
      Array<{ guildId: string }>,
      string[],
    ];

    // 빈 길드(guild-2)를 포함한 전체 길드 ID가 전달되어야 한다(M-2)
    expect(scannedGuildIds).toEqual(['guild-1', 'guild-2']);
    // snapshots 자체에는 음성 채널 멤버가 있는 guild-1만 등장한다
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].guildId).toBe('guild-1');
  });

  it('음성 채널 멤버가 있는 길드의 스냅샷에는 userIds(봇 제외)가 담긴다', async () => {
    vi.useFakeTimers();

    const guildMap = new Map<string, Guild>([
      ['guild-1', makeGuildWithVoiceChannel('guild-1', ['user-1', 'user-2'])],
    ]);
    const client = { guilds: { cache: guildMap } } as unknown as Client;

    scheduler = new BotCoPresenceScheduler(client, apiClient as never);
    scheduler.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(60_000);

    const [snapshots] = apiClient.pushCoPresenceSnapshots.mock.calls[0] as [
      Array<{ guildId: string; channelId: string; userIds: string[] }>,
      string[],
    ];
    expect(snapshots[0].userIds).toEqual(['user-1', 'user-2']);
  });

  it('모든 길드가 완전히 비어 있으면 snapshots는 빈 배열이지만 scannedGuildIds는 전체 길드를 담는다', async () => {
    vi.useFakeTimers();

    const guildMap = new Map<string, Guild>([
      ['guild-1', makeEmptyGuild('guild-1')],
      ['guild-2', makeEmptyGuild('guild-2')],
    ]);
    const client = { guilds: { cache: guildMap } } as unknown as Client;

    scheduler = new BotCoPresenceScheduler(client, apiClient as never);
    scheduler.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(60_000);

    const [snapshots, scannedGuildIds] = apiClient.pushCoPresenceSnapshots.mock.calls[0] as [
      unknown[],
      string[],
    ];
    expect(snapshots).toEqual([]);
    expect(scannedGuildIds).toEqual(['guild-1', 'guild-2']);
  });
});
