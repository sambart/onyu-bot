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

import { HEARTBEAT_SLUGS } from '../monitoring/heartbeat/heartbeat.slugs';
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

/** 음성 채널이 있는 길드(멤버 목록 포함) mock. parentId 는 카테고리 소속 여부(I1) 검증용. */
function makeGuildWithVoiceChannel(
  guildId: string,
  memberIds: string[],
  parentId: string | null = null,
): Guild {
  const members = makeCollection(memberIds.map((id) => makeMember(id)));
  const voiceChannel = {
    type: ChannelType.GuildVoice,
    id: `${guildId}-ch-1`,
    parentId,
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
  let heartbeat: { ping: Mock };
  let scheduler: BotCoPresenceScheduler;

  beforeEach(() => {
    apiClient = {
      pushCoPresenceSnapshots: vi.fn().mockResolvedValue(undefined),
      pushVoiceUserCounts: vi.fn().mockResolvedValue(undefined),
      pushCoPresenceFlush: vi.fn().mockResolvedValue(undefined),
    };
    heartbeat = { ping: vi.fn() };
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

    scheduler = new BotCoPresenceScheduler(client, apiClient as never, heartbeat as never);
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

    scheduler = new BotCoPresenceScheduler(client, apiClient as never, heartbeat as never);
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

    scheduler = new BotCoPresenceScheduler(client, apiClient as never, heartbeat as never);
    scheduler.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(60_000);

    const [snapshots, scannedGuildIds] = apiClient.pushCoPresenceSnapshots.mock.calls[0] as [
      unknown[],
      string[],
    ];
    expect(snapshots).toEqual([]);
    expect(scannedGuildIds).toEqual(['guild-1', 'guild-2']);
  });

  describe('heartbeat ping 배선', () => {
    it('tick이 정상 완료되면 BOT_CO_PRESENCE_TICK slug로 heartbeat.ping을 1회 호출한다', async () => {
      vi.useFakeTimers();

      const client = { guilds: { cache: new Map<string, Guild>() } } as unknown as Client;
      scheduler = new BotCoPresenceScheduler(client, apiClient as never, heartbeat as never);
      scheduler.onApplicationBootstrap();

      await vi.advanceTimersByTimeAsync(60_000);

      expect(heartbeat.ping).toHaveBeenCalledTimes(1);
      expect(heartbeat.ping).toHaveBeenCalledWith(HEARTBEAT_SLUGS.BOT_CO_PRESENCE_TICK);
    });

    it('tick 중 API 호출이 실패하면(catch 진입) heartbeat.ping을 호출하지 않는다', async () => {
      vi.useFakeTimers();
      apiClient.pushCoPresenceSnapshots.mockRejectedValue(new Error('api down'));

      const client = { guilds: { cache: new Map<string, Guild>() } } as unknown as Client;
      scheduler = new BotCoPresenceScheduler(client, apiClient as never, heartbeat as never);
      scheduler.onApplicationBootstrap();

      await vi.advanceTimersByTimeAsync(60_000);

      expect(heartbeat.ping).not.toHaveBeenCalled();
    });
  });

  // ── I1: 카테고리 단위 제외 채널 관통 — parentCategoryId 수집 ────────────────
  describe('카테고리 ID 수집 (I1)', () => {
    it('T-BOT-CAT-01: 카테고리에 속한 음성 채널의 스냅샷은 parentCategoryId를 담는다', async () => {
      vi.useFakeTimers();

      const guildMap = new Map<string, Guild>([
        ['guild-1', makeGuildWithVoiceChannel('guild-1', ['user-1', 'user-2'], 'cat-1')],
      ]);
      const client = { guilds: { cache: guildMap } } as unknown as Client;

      scheduler = new BotCoPresenceScheduler(client, apiClient as never, heartbeat as never);
      scheduler.onApplicationBootstrap();

      await vi.advanceTimersByTimeAsync(60_000);

      const [snapshots] = apiClient.pushCoPresenceSnapshots.mock.calls[0] as [
        Array<{ parentCategoryId: string | null }>,
        string[],
      ];
      expect(snapshots[0].parentCategoryId).toBe('cat-1');
    });

    it('T-BOT-CAT-02: 카테고리 없는(최상위) 음성 채널의 스냅샷은 parentCategoryId가 null이다(undefined 아님)', async () => {
      vi.useFakeTimers();

      const guildMap = new Map<string, Guild>([
        ['guild-1', makeGuildWithVoiceChannel('guild-1', ['user-1', 'user-2'])],
      ]);
      const client = { guilds: { cache: guildMap } } as unknown as Client;

      scheduler = new BotCoPresenceScheduler(client, apiClient as never, heartbeat as never);
      scheduler.onApplicationBootstrap();

      await vi.advanceTimersByTimeAsync(60_000);

      const [snapshots] = apiClient.pushCoPresenceSnapshots.mock.calls[0] as [
        Array<{ parentCategoryId: string | null }>,
        string[],
      ];
      expect(snapshots[0].parentCategoryId).toBeNull();
      expect(snapshots[0].parentCategoryId).not.toBeUndefined();
    });
  });

  // ── I3: tick 중첩 가드 ───────────────────────────────────────────────────
  describe('tick 중첩 가드 (I3)', () => {
    it('T-BOT-TICK-01: API 응답이 지연되면(미해결 Promise) 다음 tick 주기가 되어도 pushCoPresenceSnapshots는 1회만 호출된다', async () => {
      vi.useFakeTimers();
      let resolveFirst!: () => void;
      apiClient.pushCoPresenceSnapshots.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      );

      const client = { guilds: { cache: new Map<string, Guild>() } } as unknown as Client;
      scheduler = new BotCoPresenceScheduler(client, apiClient as never, heartbeat as never);
      scheduler.onApplicationBootstrap();

      // 60초(tick1 진입, 응답 대기 중) + 60초(tick2 시도 — isTickRunning 가드로 skip) 경과
      await vi.advanceTimersByTimeAsync(120_000);

      expect(apiClient.pushCoPresenceSnapshots).toHaveBeenCalledTimes(1);

      resolveFirst(); // pending promise 방치 방지(cleanup)
    });

    it('T-BOT-TICK-02: 지연되던 응답이 resolve된 후 다음 60초가 지나면 다시 호출된다(가드 해제 확인)', async () => {
      vi.useFakeTimers();
      let resolveFirst!: () => void;
      apiClient.pushCoPresenceSnapshots.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      );

      const client = { guilds: { cache: new Map<string, Guild>() } } as unknown as Client;
      scheduler = new BotCoPresenceScheduler(client, apiClient as never, heartbeat as never);
      scheduler.onApplicationBootstrap();

      await vi.advanceTimersByTimeAsync(60_000); // tick1 진입 — 응답 대기 중
      expect(apiClient.pushCoPresenceSnapshots).toHaveBeenCalledTimes(1);

      resolveFirst();
      await vi.advanceTimersByTimeAsync(60_000); // tick1 완료 flush + tick2 실행

      expect(apiClient.pushCoPresenceSnapshots).toHaveBeenCalledTimes(2);
    });

    it('T-BOT-TICK-03: tick이 예외로 실패해도 다음 주기에는 정상 실행된다(finally 해제 — 영구 잠김 없음)', async () => {
      vi.useFakeTimers();
      apiClient.pushCoPresenceSnapshots.mockRejectedValueOnce(new Error('api down'));

      const client = { guilds: { cache: new Map<string, Guild>() } } as unknown as Client;
      scheduler = new BotCoPresenceScheduler(client, apiClient as never, heartbeat as never);
      scheduler.onApplicationBootstrap();

      await vi.advanceTimersByTimeAsync(60_000); // tick1 실패
      expect(heartbeat.ping).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(60_000); // tick2 정상 실행

      expect(apiClient.pushCoPresenceSnapshots).toHaveBeenCalledTimes(2);
      expect(heartbeat.ping).toHaveBeenCalledTimes(1);
    });

    it('T-BOT-TICK-04: 이전 tick 미완료로 skip되면 heartbeat.ping을 호출하지 않는다', async () => {
      vi.useFakeTimers();
      let resolveFirst!: () => void;
      apiClient.pushCoPresenceSnapshots.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      );

      const client = { guilds: { cache: new Map<string, Guild>() } } as unknown as Client;
      scheduler = new BotCoPresenceScheduler(client, apiClient as never, heartbeat as never);
      scheduler.onApplicationBootstrap();

      await vi.advanceTimersByTimeAsync(120_000); // tick1 진행 중, tick2는 skip

      expect(heartbeat.ping).not.toHaveBeenCalled();

      resolveFirst();
    });

    it('T-BOT-TICK-05: onApplicationShutdown 이후에는 타이머가 진행돼도 tick이 실행되지 않는다(기존 isShuttingDown 회귀)', async () => {
      vi.useFakeTimers();

      const client = { guilds: { cache: new Map<string, Guild>() } } as unknown as Client;
      scheduler = new BotCoPresenceScheduler(client, apiClient as never, heartbeat as never);
      scheduler.onApplicationBootstrap();

      await scheduler.onApplicationShutdown();
      apiClient.pushCoPresenceSnapshots.mockClear();

      await vi.advanceTimersByTimeAsync(60_000);

      expect(apiClient.pushCoPresenceSnapshots).not.toHaveBeenCalled();
    });
  });
});
