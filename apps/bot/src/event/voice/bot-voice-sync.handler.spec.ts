import { Logger } from '@nestjs/common';
import { type BotApiClientService, type VoiceSyncDto } from '@onyu/bot-api-client';
import { ChannelType, type Client } from 'discord.js';
import { type Mock } from 'vitest';

import { BotVoiceSyncHandler } from './bot-voice-sync.handler';

/**
 * discord.js Collection의 최소 fake — 본 핸들러가 실제로 쓰는 filter/values만 구현한다.
 * (dispatcher spec의 `as unknown as` 캐스팅 관례 승계 — 실제 클래스 인스턴스 생성 불필요)
 */
interface FakeCollection<T> {
  filter: (fn: (item: T) => boolean) => FakeCollection<T>;
  values: () => IterableIterator<T>;
}

function makeCollection<T>(items: T[]): FakeCollection<T> {
  return {
    filter: (fn: (item: T) => boolean) => makeCollection(items.filter(fn)),
    values: () => items.values(),
  };
}

function makeVoiceState(overrides: Record<string, unknown> = {}) {
  return {
    selfMute: false,
    selfDeaf: false,
    selfVideo: false,
    streaming: false,
    serverMute: false,
    serverDeaf: false,
    ...overrides,
  };
}

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    displayName: 'Alice',
    user: { bot: false },
    displayAvatarURL: () => 'https://avatar/alice.png',
    presence: null,
    voice: makeVoiceState(),
    ...overrides,
  };
}

/**
 * F-VOICE-135 — `flagsBitfield`/`parentId`/`parentFlagsBitfield` 인자를 추가해 은닉 채널·
 * 카테고리 판별을 목킹할 수 있게 확장한다(dispatcher spec T1 과 동일 목 패턴 — `flags` 는
 * `{ bitfield: number }` 형태의 순수 객체).
 */
function makeVoiceChannel(
  id: string,
  members: ReturnType<typeof makeMember>[],
  flagsBitfield = 0,
  parentId: string | null = null,
  parentFlagsBitfield = 0,
  name: string = `채널-${id}`,
) {
  return {
    id,
    name,
    type: ChannelType.GuildVoice,
    flags: { bitfield: flagsBitfield },
    parentId,
    parent: parentId
      ? { name: `${parentId}-name`, flags: { bitfield: parentFlagsBitfield } }
      : null,
    members: makeCollection(members),
  };
}

/** F-VOICE-135 실측(리뷰 §⑤-5) 대로 은닉 채널·카테고리의 `name` 은 정확히 이 리터럴로 온다. */
const OBFUSCATED_NAME = '___hidden___';
/** F-VOICE-135 — `CHANNEL_OBFUSCATED` 플래그 비트(`1 << 17` = 131072, 실측값). */
const OBFUSCATED_BIT = 131072;

function makeGuild(id: string, channels: ReturnType<typeof makeVoiceChannel>[]) {
  return {
    id,
    channels: { cache: makeCollection(channels) },
  };
}

describe('BotVoiceSyncHandler', () => {
  let apiClient: { healthCheck: Mock; pushVoiceSync: Mock };

  beforeEach(() => {
    apiClient = {
      healthCheck: vi.fn().mockResolvedValue(undefined),
      pushVoiceSync: vi.fn().mockResolvedValue(undefined),
    };
  });

  function makeHandler(guilds: ReturnType<typeof makeGuild>[]): BotVoiceSyncHandler {
    const client = { guilds: { cache: makeCollection(guilds) } };
    return new BotVoiceSyncHandler(
      client as unknown as Client,
      apiClient as unknown as BotApiClientService,
    );
  }

  it('강제뮤트(serverMute) 중인 유저는 micOn:false·serverMute:true로 복구 동기화된다 (UC-11 TC-11-08, 회귀 방지 핵심)', async () => {
    const member = makeMember({ voice: makeVoiceState({ selfMute: false, serverMute: true }) });
    const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [member])]);
    const handler = makeHandler([guild]);

    await handler.handleReady();

    expect(apiClient.pushVoiceSync).toHaveBeenCalledOnce();
    const dto = apiClient.pushVoiceSync.mock.calls[0][0] as VoiceSyncDto;
    expect(dto.guildId).toBe('guild-1');
    expect(dto.users).toHaveLength(1);
    expect(dto.users[0]).toMatchObject({
      userId: 'user-1',
      micOn: false,
      serverMute: true,
      serverDeaf: false,
    });
  });

  it('selfMute/serverMute 모두 false면 micOn:true로 동기화된다 (舊 로직은 selfMute만 보고 micOn:true로 판정했던 것과 결과는 같지만, 이제는 serverMute도 반영된 판정이다)', async () => {
    const member = makeMember({ voice: makeVoiceState({ selfMute: false, serverMute: false }) });
    const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [member])]);
    const handler = makeHandler([guild]);

    await handler.handleReady();

    const dto = apiClient.pushVoiceSync.mock.calls[0][0] as VoiceSyncDto;
    expect(dto.users[0].micOn).toBe(true);
  });

  it('serverDeaf가 부과된 유저는 payload에 serverDeaf:true가 포함된다', async () => {
    const member = makeMember({ voice: makeVoiceState({ serverDeaf: true }) });
    const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [member])]);
    const handler = makeHandler([guild]);

    await handler.handleReady();

    const dto = apiClient.pushVoiceSync.mock.calls[0][0] as VoiceSyncDto;
    expect(dto.users[0].serverDeaf).toBe(true);
  });

  it('serverMute가 null이면 false로 정규화되어 micOn 판정에 영향을 주지 않는다 (null 안전)', async () => {
    const member = makeMember({
      voice: makeVoiceState({ selfMute: false, serverMute: null }),
    });
    const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [member])]);
    const handler = makeHandler([guild]);

    await handler.handleReady();

    const dto = apiClient.pushVoiceSync.mock.calls[0][0] as VoiceSyncDto;
    expect(dto.users[0].micOn).toBe(true);
    expect(dto.users[0].serverMute).toBe(false);
  });

  it('음성 채널에 유저가 없으면 해당 길드는 pushVoiceSync를 호출하지 않는다', async () => {
    const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [])]);
    const handler = makeHandler([guild]);

    await handler.handleReady();

    expect(apiClient.pushVoiceSync).not.toHaveBeenCalled();
  });

  it('봇 유저는 동기화 대상에서 제외된다', async () => {
    const humanMember = makeMember({ id: 'user-1' });
    const botMember = makeMember({ id: 'bot-1', user: { bot: true } });
    const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [humanMember, botMember])]);
    const handler = makeHandler([guild]);

    await handler.handleReady();

    const dto = apiClient.pushVoiceSync.mock.calls[0][0] as VoiceSyncDto;
    expect(dto.users).toHaveLength(1);
    expect(dto.users[0].userId).toBe('user-1');
  });

  // ──────────────────────────────────────────────
  // F-VOICE-117(D1-a) — 주기 sync(5분) 승격
  // ──────────────────────────────────────────────
  describe('주기 sync(F-VOICE-117)', () => {
    const SYNC_INTERVAL_MS = 300_000;

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('TC-1-01 — clientReady 후 5분 간격 setInterval이 걸리고, 타이머 전진 시 pushVoiceSync가 재호출된다', async () => {
      const member = makeMember();
      const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [member])]);
      const handler = makeHandler([guild]);

      await handler.handleReady();
      expect(apiClient.pushVoiceSync).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
      expect(apiClient.pushVoiceSync).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
      expect(apiClient.pushVoiceSync).toHaveBeenCalledTimes(3);
    });

    it('TC-1-02 — isSyncRunning: 이전 sync가 미완료 상태면 다음 주기를 skip한다', async () => {
      const member = makeMember();
      const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [member])]);
      const handler = makeHandler([guild]);

      await handler.handleReady();
      expect(apiClient.pushVoiceSync).toHaveBeenCalledTimes(1);

      // 다음 주기의 pushVoiceSync가 영구히 pending 상태가 되도록 만든다 — isSyncRunning이
      // true로 유지되는 동안 그 다음 주기가 재진입하지 않는지 검증한다.
      let resolvePending: (() => void) | undefined;
      apiClient.pushVoiceSync.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolvePending = resolve;
          }),
      );

      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
      expect(apiClient.pushVoiceSync).toHaveBeenCalledTimes(2); // 2회차 호출은 진행 중(pending)

      // 2회차가 아직 끝나지 않은 채로 3회차 주기가 도래해도 skip되어 호출되지 않는다.
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
      expect(apiClient.pushVoiceSync).toHaveBeenCalledTimes(2);

      resolvePending?.();
    });

    it('TC-1-03 — onApplicationShutdown 후 타이머를 전진시켜도 pushVoiceSync가 호출되지 않는다', async () => {
      const member = makeMember();
      const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [member])]);
      const handler = makeHandler([guild]);

      await handler.handleReady();
      expect(apiClient.pushVoiceSync).toHaveBeenCalledTimes(1);

      await handler.onApplicationShutdown();

      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2);
      expect(apiClient.pushVoiceSync).toHaveBeenCalledTimes(1);
    });

    it('TC-1-03b — 주기 실행이 성공하면 로그를 출력하지 않고, 실패하면 guildId를 포함한 로그를 1회 남기며 다음 주기도 계속 실행한다', async () => {
      const member = makeMember();
      const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [member])]);
      const handler = makeHandler([guild]);

      await handler.handleReady();

      const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined as never);
      const debugSpy = vi
        .spyOn(Logger.prototype, 'debug')
        .mockImplementation(() => undefined as never);
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined as never);

      // 성공 주기 — 로그 호출 자체가 없어야 한다.
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
      expect(logSpy).not.toHaveBeenCalled();
      expect(debugSpy).not.toHaveBeenCalled();

      // 실패 주기 — guildId를 포함한 error 1줄이 남고, 다음 주기도 계속 실행된다(E-17b).
      apiClient.pushVoiceSync.mockRejectedValueOnce(new Error('api down'));
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('guild=guild-1'),
        expect.anything(),
      );

      logSpy.mockClear();
      apiClient.pushVoiceSync.mockResolvedValue(undefined);
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
      expect(apiClient.pushVoiceSync).toHaveBeenCalledTimes(4); // 1(초기)+1(성공)+1(실패)+1(다음 성공)
      expect(logSpy).not.toHaveBeenCalled();

      logSpy.mockRestore();
      debugSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('TC-1-04 — handleReady의 await 창(waitForApi 이후 최초 sync 완료 전)에서 종료가 시작되면 타이머를 설치하지 않는다 (결함① 회귀 가드)', async () => {
      const member = makeMember();
      const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [member])]);
      const handler = makeHandler([guild]);

      // healthCheck는 성공 경로로 둔다 — waitForApi()가 실패하면 sleep() 타이머가 생겨
      // vi.getTimerCount() 단언이 오염된다.
      apiClient.healthCheck.mockResolvedValue(undefined);

      // 최초 sync(pushVoiceSync)를 pending 상태로 붙잡아 handleReady()의 await 창을 연다.
      let resolvePending: (() => void) | undefined;
      apiClient.pushVoiceSync.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolvePending = resolve;
          }),
      );

      const readyPromise = handler.handleReady();

      // waitForApi(healthCheck 성공) + syncGuild 진입(pushVoiceSync 호출)까지 마이크로태스크를
      // 흘려보낸다 — 아직 handleReady()는 최초 sync 완료를 기다리는 중이다.
      await vi.advanceTimersByTimeAsync(0);

      // 그 창 안에서 종료가 먼저 시작된다 — 이 시점 intervalId는 아직 null이라
      // onApplicationShutdown()의 clearInterval은 아무 것도 하지 않는다.
      await handler.onApplicationShutdown();

      // 최초 sync를 완주시켜 handleReady()가 setInterval 설치 지점까지 도달하게 한다.
      resolvePending?.();
      await readyPromise;

      // (핵심) 고아 타이머가 생기지 않았음을 직접 고정한다 — "타이머 전진 후 pushVoiceSync
      // 미재호출" 단언만으로는 runSync()의 기존 isShuttingDown 가드 때문에 이 결함을 잡지
      // 못한다(가드를 지워도 통과해버린다).
      expect(vi.getTimerCount()).toBe(0);
      expect((handler as unknown as { intervalId: unknown }).intervalId).toBeNull();
    });

    it('TC-1-05 — waitForApi()가 최대 재시도 후 실패(false)를 반환하면 setInterval을 설치하지 않는다', async () => {
      const member = makeMember();
      const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [member])]);
      const handler = makeHandler([guild]);

      // healthCheck가 계속 실패하면 waitForApi()는 재시도(최대 15회 × 4초 간격)를 모두 소진하고
      // false를 반환한다 — handleReady()는 이 시점에 조기 return하므로, setInterval 설치 지점
      // (49행)에 아예 도달하지 않는다. isShuttingDown 가드와는 다른 코드 경로다.
      apiClient.healthCheck.mockRejectedValue(new Error('api down'));

      const readyPromise = handler.handleReady();
      // waitForApi의 재시도 루프(최대 60초)를 넉넉한 여유를 두고 전량 흘려보낸다.
      await vi.advanceTimersByTimeAsync(120_000);
      await readyPromise;

      expect(apiClient.pushVoiceSync).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect((handler as unknown as { intervalId: unknown }).intervalId).toBeNull();
    });
  });

  // ──────────────────────────────────────────────
  // Discord 채널 은닉(Channel Obfuscation) 유입 차단 — F-VOICE-135, 계획 §7 T2
  // ──────────────────────────────────────────────
  describe('채널 은닉 판별(F-VOICE-135)', () => {
    it('T2-1: 은닉 채널 재적자도 수집은 된다(F2 회귀 방지 핵심 단언)', async () => {
      const member = makeMember();
      const guild = makeGuild('guild-1', [
        makeVoiceChannel('ch-1', [member], OBFUSCATED_BIT, null, 0, OBFUSCATED_NAME),
      ]);
      const handler = makeHandler([guild]);

      await handler.handleReady();

      expect(apiClient.pushVoiceSync).toHaveBeenCalledOnce();
      const dto = apiClient.pushVoiceSync.mock.calls[0][0] as VoiceSyncDto;
      expect(dto.users).toHaveLength(1);
      expect(dto.users[0].userId).toBe('user-1');
    });

    it('T2-2: 은닉 채널 재적자의 channelName은 빈 문자열, categoryName은 null이 된다', async () => {
      const member = makeMember();
      const guild = makeGuild('guild-1', [
        makeVoiceChannel(
          'ch-1',
          [member],
          OBFUSCATED_BIT,
          'cat-1',
          OBFUSCATED_BIT,
          OBFUSCATED_NAME,
        ),
      ]);
      const handler = makeHandler([guild]);

      await handler.handleReady();

      const dto = apiClient.pushVoiceSync.mock.calls[0][0] as VoiceSyncDto;
      expect(dto.users[0].channelName).toBe('');
      expect(dto.users[0].categoryName).toBeNull();
    });

    it('T2-2b(엣지 ⓐ): 채널만 은닉이면 categoryName은 실명 그대로 보존된다', async () => {
      const member = makeMember();
      const guild = makeGuild('guild-1', [
        makeVoiceChannel('ch-1', [member], OBFUSCATED_BIT, 'cat-1', 0, OBFUSCATED_NAME),
      ]);
      const handler = makeHandler([guild]);

      await handler.handleReady();

      const dto = apiClient.pushVoiceSync.mock.calls[0][0] as VoiceSyncDto;
      expect(dto.users[0].channelName).toBe('');
      expect(dto.users[0].categoryName).toBe('cat-1-name');
    });

    it('T2-3: 일반 채널 유저는 기존과 동일하다(회귀 없음)', async () => {
      const member = makeMember();
      const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [member], 0, 'cat-1', 0)]);
      const handler = makeHandler([guild]);

      await handler.handleReady();

      const dto = apiClient.pushVoiceSync.mock.calls[0][0] as VoiceSyncDto;
      expect(dto.users[0].channelName).toBe('채널-ch-1');
      expect(dto.users[0].categoryName).toBe('cat-1-name');
    });

    it('T2-4: 은닉·일반 채널이 섞인 길드에서 은닉 쪽만 벗겨진다', async () => {
      const hiddenMember = makeMember({ id: 'user-hidden' });
      const visibleMember = makeMember({ id: 'user-visible' });
      const guild = makeGuild('guild-1', [
        makeVoiceChannel('ch-hidden', [hiddenMember], OBFUSCATED_BIT, null, 0, OBFUSCATED_NAME),
        makeVoiceChannel('ch-visible', [visibleMember], 0),
      ]);
      const handler = makeHandler([guild]);

      await handler.handleReady();

      const dto = apiClient.pushVoiceSync.mock.calls[0][0] as VoiceSyncDto;
      const hidden = dto.users.find((u) => u.userId === 'user-hidden');
      const visible = dto.users.find((u) => u.userId === 'user-visible');
      expect(hidden?.channelName).toBe('');
      expect(visible?.channelName).toBe('채널-ch-visible');
    });
  });

  // ──────────────────────────────────────────────
  // 은닉 판정 집계 로그 정확성(리뷰 후속) — PR #630 review, F-VOICE-135
  // 결함: 카운터가 채널 단위가 아니라 멤버·이벤트 단위로 증가해 은닉 확산도를 왜곡했다.
  // ──────────────────────────────────────────────
  describe('은닉 판정 집계 로그 정확성(리뷰 후속)', () => {
    function findSummaryLog(logSpy: { mock: { calls: unknown[][] } }): string | undefined {
      return logSpy.mock.calls
        .map((call) => call[0])
        .find((msg): msg is string => typeof msg === 'string' && msg.includes('은닉 판정 집계'));
    }

    it('T3-1: 같은 은닉 채널에 재적자 3명이 있어도 집계는 채널 1개로 수렴한다(멤버 단위 뻥튀기 회귀 방지)', async () => {
      const members = [
        makeMember({ id: 'user-1' }),
        makeMember({ id: 'user-2' }),
        makeMember({ id: 'user-3' }),
      ];
      const guild = makeGuild('guild-1', [
        makeVoiceChannel('ch-hidden', members, OBFUSCATED_BIT, null, 0, OBFUSCATED_NAME),
      ]);
      const handler = makeHandler([guild]);
      const state = handler as unknown as {
        obfuscatedChannelIds: Set<string>;
        obfuscatedChannelEvents: number;
        lastObfuscationLogAt: number;
      };
      // lastObfuscationLogAt=0(기본값)이면 첫 멤버 판정 직후 스로틀을 즉시 통과해 flush되어
      // 버려, 이어지는 2·3번째 멤버 판정이 다른 창으로 갈리는 타이밍 아티팩트가 생긴다.
      // "방금"으로 고정해 3명 전원의 판정이 flush 없이 같은 창에 누적되게 한다.
      state.lastObfuscationLogAt = Date.now();

      await handler.handleReady();

      // 버그였다면(멤버 단위 카운터) size가 아니라 count가 3이 됐을 것 — Set이므로 고유 1.
      expect(state.obfuscatedChannelIds.size).toBe(1);
      expect(state.obfuscatedChannelIds.has('ch-hidden')).toBe(true);
      expect(state.obfuscatedChannelEvents).toBe(3);
    });

    it('T3-2: 은닉 판정 로그 플러시 후 집계가 초기화되어 다음 창으로 누적되지 않는다', async () => {
      vi.useFakeTimers();
      const member = makeMember();
      const guild = makeGuild('guild-1', [
        makeVoiceChannel('ch-hidden', [member], OBFUSCATED_BIT, null, 0, OBFUSCATED_NAME),
      ]);
      const handler = makeHandler([guild]);
      const state = handler as unknown as {
        obfuscatedChannelIds: Set<string>;
        obfuscatedChannelEvents: number;
      };

      await handler.handleReady();
      // 최초 실행은 lastObfuscationLogAt=0이라 스로틀을 즉시 통과해 로그+초기화가 일어난다.
      expect(state.obfuscatedChannelIds.size).toBe(0);
      expect(state.obfuscatedChannelEvents).toBe(0);

      // 5분 뒤 두 번째 주기 sync — 같은 은닉 채널을 다시 판정한다. 스로틀(1시간)이 아직
      // 끝나지 않아 로그는 나가지 않지만 판정 자체는 계속 집계돼야 한다.
      await vi.advanceTimersByTimeAsync(300_000);
      // 이전 창이 초기화되지 않았다면 여기서 channelEvents가 2가 됐을 것이다.
      expect(state.obfuscatedChannelIds.size).toBe(1);
      expect(state.obfuscatedChannelEvents).toBe(1);

      vi.useRealTimers();
    });

    it('T3-3: 집계 로그 문자열에 채널 id가 포함되지 않는다(개별 식별자 로깅 금지)', async () => {
      const member = makeMember();
      const guild = makeGuild('guild-1', [
        makeVoiceChannel('ch-secret-id', [member], OBFUSCATED_BIT, null, 0, OBFUSCATED_NAME),
      ]);
      const handler = makeHandler([guild]);
      const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined as never);

      await handler.handleReady();

      const summaryLog = findSummaryLog(logSpy);
      expect(summaryLog).toBeDefined();
      expect(summaryLog).not.toContain('ch-secret-id');

      logSpy.mockRestore();
    });
  });
});
