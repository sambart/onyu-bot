import { type BotApiClientService, type VoiceStateUpdateDto } from '@onyu/bot-api-client';
import type { GuildMember, VoiceState } from 'discord.js';
import { type Mock } from 'vitest';

import { BotVoiceStateDispatcher } from './bot-voice-state.dispatcher';

/** 테스트용 최소 VoiceState fake. discord.js VoiceState는 getter 기반 클래스라 필요한
 * 필드만 채운 객체를 캐스팅해 사용한다(as 사용 이유: 실제 클래스 인스턴스 생성 불필요한
 * 순수 값 판별 로직만 검증). */
function makeVoiceState(overrides: Partial<VoiceState> = {}): VoiceState {
  const base = {
    guild: { id: 'guild-1' },
    id: 'user-1',
    member: null,
    channelId: null,
    channel: null,
    selfMute: false,
    selfDeaf: false,
    selfVideo: false,
    streaming: false,
  };
  return { ...base, ...overrides } as unknown as VoiceState;
}

function makeMember(overrides: Partial<GuildMember> = {}): GuildMember {
  const base = {
    id: 'user-1',
    displayName: 'Alice',
    user: { bot: false },
    displayAvatarURL: () => 'https://avatar/alice.png',
    presence: null,
  };
  return { ...base, ...overrides } as unknown as GuildMember;
}

function makeChannel(name: string, memberIds: string[], parentId: string | null = null) {
  const members = new Map(
    memberIds.map((id) => [id, { id, user: { bot: false } }] as [string, unknown]),
  );
  return {
    name,
    parentId,
    parent: parentId ? { name: `${parentId}-name` } : null,
    members,
  } as unknown as VoiceState['channel'];
}

describe('BotVoiceStateDispatcher', () => {
  let apiClient: { sendVoiceStateUpdate: Mock };
  let dispatcher: BotVoiceStateDispatcher;

  beforeEach(() => {
    apiClient = { sendVoiceStateUpdate: vi.fn().mockResolvedValue(undefined) };
    dispatcher = new BotVoiceStateDispatcher(apiClient as unknown as BotApiClientService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ──────────────────────────────────────────────
  // A. 이벤트 타입 판정
  // ──────────────────────────────────────────────
  describe('이벤트 타입 판정', () => {
    it('채널 없음 → 있음: join으로 판정한다', async () => {
      const oldState = makeVoiceState({ channelId: null, channel: null });
      const member = makeMember();
      const newState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        member,
      });

      await dispatcher.handleVoiceStateUpdate(oldState, newState);

      expect(apiClient.sendVoiceStateUpdate).toHaveBeenCalledOnce();
      const dto = apiClient.sendVoiceStateUpdate.mock.calls[0][0] as VoiceStateUpdateDto;
      expect(dto.eventType).toBe('join');
    });

    it('채널 있음 → 없음: leave로 판정한다', async () => {
      const oldState = makeVoiceState({ channelId: 'ch-1', channel: makeChannel('일반', []) });
      const newState = makeVoiceState({ channelId: null, channel: null });

      await dispatcher.handleVoiceStateUpdate(oldState, newState);

      const dto = apiClient.sendVoiceStateUpdate.mock.calls[0][0] as VoiceStateUpdateDto;
      expect(dto.eventType).toBe('leave');
    });

    it('채널A → 채널B: move로 판정한다', async () => {
      const oldState = makeVoiceState({ channelId: 'ch-A', channel: makeChannel('A', []) });
      const newState = makeVoiceState({ channelId: 'ch-B', channel: makeChannel('B', ['user-1']) });

      await dispatcher.handleVoiceStateUpdate(oldState, newState);

      const dto = apiClient.sendVoiceStateUpdate.mock.calls[0][0] as VoiceStateUpdateDto;
      expect(dto.eventType).toBe('move');
    });

    it('mic/streaming/video/deaf 상태 변화만 있으면 각각 toggle로 판정한다', async () => {
      const cases: Array<[Partial<VoiceState>, Partial<VoiceState>, string]> = [
        [{ selfMute: false }, { selfMute: true }, 'mic_toggle'],
        [{ streaming: false }, { streaming: true }, 'streaming_toggle'],
        [{ selfVideo: false }, { selfVideo: true }, 'video_toggle'],
        [{ selfDeaf: false }, { selfDeaf: true }, 'deaf_toggle'],
      ];

      for (const [oldOverrides, newOverrides, expected] of cases) {
        apiClient.sendVoiceStateUpdate.mockClear();
        const oldState = makeVoiceState({
          channelId: 'ch-1',
          channel: makeChannel('일반', ['user-1']),
          ...oldOverrides,
        });
        const newState = makeVoiceState({
          channelId: 'ch-1',
          channel: makeChannel('일반', ['user-1']),
          ...newOverrides,
        });

        await dispatcher.handleVoiceStateUpdate(oldState, newState);

        const dto = apiClient.sendVoiceStateUpdate.mock.calls[0][0] as VoiceStateUpdateDto;
        expect(dto.eventType).toBe(expected);
      }
    });

    it('아무 변화도 없으면 API를 호출하지 않는다', async () => {
      const state = makeVoiceState({ channelId: 'ch-1', channel: makeChannel('일반', ['user-1']) });

      await dispatcher.handleVoiceStateUpdate(state, state);

      expect(apiClient.sendVoiceStateUpdate).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // D. 서버 강제뮤트/스피커차단(serverMute/serverDeaf) — F-VOICE-099/100, UC-11
  // ──────────────────────────────────────────────
  describe('서버 강제뮤트/스피커차단 (F-VOICE-099/100)', () => {
    it('serverMute만 변화하면 mic_toggle로 판정하고 micOn:false·serverMute:true를 payload에 담는다 (TC-11-01)', async () => {
      const oldState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        serverMute: false,
      });
      const newState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        serverMute: true,
      });

      await dispatcher.handleVoiceStateUpdate(oldState, newState);

      const dto = apiClient.sendVoiceStateUpdate.mock.calls[0][0] as VoiceStateUpdateDto;
      expect(dto.eventType).toBe('mic_toggle');
      expect(dto.micOn).toBe(false);
      expect(dto.serverMute).toBe(true);
    });

    it('serverDeaf만 변화하면 deaf_toggle로 판정하고 serverDeaf:true를 payload에 담는다 (TC-11-06)', async () => {
      const oldState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        serverDeaf: false,
      });
      const newState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        serverDeaf: true,
      });

      await dispatcher.handleVoiceStateUpdate(oldState, newState);

      const dto = apiClient.sendVoiceStateUpdate.mock.calls[0][0] as VoiceStateUpdateDto;
      expect(dto.eventType).toBe('deaf_toggle');
      expect(dto.serverDeaf).toBe(true);
    });

    it('마이크 ON 판정 진리표: selfMute·serverMute 조합에 따라 micOn이 결정된다 (TC-11-03/04/05)', async () => {
      // [selfMute, serverMute, expectedMicOn] — 어느 한쪽이라도 켜져 있으면 micOn:false
      const cases: Array<[boolean, boolean, boolean]> = [
        [false, false, true],
        [true, false, false],
        [false, true, false], // TC-11-03: 강제뮤트 상태로 join
        [true, true, false],
      ];

      for (const [selfMute, serverMute, expectedMicOn] of cases) {
        apiClient.sendVoiceStateUpdate.mockClear();
        const oldState = makeVoiceState({ channelId: null, channel: null });
        const member = makeMember();
        const newState = makeVoiceState({
          channelId: 'ch-1',
          channel: makeChannel('일반', ['user-1']),
          member,
          selfMute,
          serverMute,
        });

        await dispatcher.handleVoiceStateUpdate(oldState, newState);

        const dto = apiClient.sendVoiceStateUpdate.mock.calls[0][0] as VoiceStateUpdateDto;
        expect(dto.micOn).toBe(expectedMicOn);
      }
    });

    it('selfMute:true 상태에서 serverMute를 추가 부과해도 micOn은 false로 불변이나 이벤트는 발화한다 (TC-11-04)', async () => {
      const oldState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        selfMute: true,
        serverMute: false,
      });
      const newState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        selfMute: true,
        serverMute: true,
      });

      await dispatcher.handleVoiceStateUpdate(oldState, newState);

      const dto = apiClient.sendVoiceStateUpdate.mock.calls[0][0] as VoiceStateUpdateDto;
      expect(dto.eventType).toBe('mic_toggle');
      expect(dto.micOn).toBe(false);
    });

    it('selfMute:true를 유지한 채 serverMute만 해제해도 micOn은 false로 불변이나 이벤트는 발화한다 (TC-11-04, 해제 순서 전이)', async () => {
      const oldState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        selfMute: true,
        serverMute: true,
      });
      const newState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        selfMute: true,
        serverMute: false,
      });

      await dispatcher.handleVoiceStateUpdate(oldState, newState);

      const dto = apiClient.sendVoiceStateUpdate.mock.calls[0][0] as VoiceStateUpdateDto;
      expect(dto.eventType).toBe('mic_toggle');
      expect(dto.micOn).toBe(false);
    });

    it('serverMute/serverDeaf가 양쪽 다 null/undefined로 무변화이면 이벤트를 발화하지 않는다 (null 안전 정규화, §3 D2 회귀 가드)', async () => {
      const oldState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        serverMute: null,
        serverDeaf: undefined,
      });
      const newState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        serverMute: undefined,
        serverDeaf: null,
      });

      await dispatcher.handleVoiceStateUpdate(oldState, newState);

      expect(apiClient.sendVoiceStateUpdate).not.toHaveBeenCalled();
    });

    it('serverMute:null이면 false로 정규화되어 micOn 판정에서 켜진 것으로 취급되지 않는다 (null 안전)', async () => {
      const oldState = makeVoiceState({ channelId: null, channel: null });
      const member = makeMember();
      const newState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        member,
        selfMute: false,
        serverMute: null,
      });

      await dispatcher.handleVoiceStateUpdate(oldState, newState);

      const dto = apiClient.sendVoiceStateUpdate.mock.calls[0][0] as VoiceStateUpdateDto;
      expect(dto.micOn).toBe(true);
    });

    it('payload에 serverMute/serverDeaf 필드가 동봉된다', async () => {
      const oldState = makeVoiceState({ channelId: null, channel: null });
      const member = makeMember();
      const newState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        member,
        serverMute: true,
        serverDeaf: true,
      });

      await dispatcher.handleVoiceStateUpdate(oldState, newState);

      const dto = apiClient.sendVoiceStateUpdate.mock.calls[0][0] as VoiceStateUpdateDto;
      expect(dto.serverMute).toBe(true);
      expect(dto.serverDeaf).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // B. leave 재시도
  // ──────────────────────────────────────────────
  describe('leave 재시도', () => {
    it('2회 실패 후 3회차 성공하면 최종적으로 성공 처리된다(3회 호출)', async () => {
      vi.useFakeTimers();
      apiClient.sendVoiceStateUpdate
        .mockRejectedValueOnce(new Error('net-fail-1'))
        .mockRejectedValueOnce(new Error('net-fail-2'))
        .mockResolvedValueOnce(undefined);

      const oldState = makeVoiceState({ channelId: 'ch-1', channel: makeChannel('일반', []) });
      const newState = makeVoiceState({ channelId: null, channel: null });

      const promise = dispatcher.handleVoiceStateUpdate(oldState, newState);
      await vi.runAllTimersAsync();
      await promise;

      expect(apiClient.sendVoiceStateUpdate).toHaveBeenCalledTimes(3);
    });

    it('3회 모두 실패해도 예외를 던지지 않는다(로그만 남김)', async () => {
      vi.useFakeTimers();
      apiClient.sendVoiceStateUpdate.mockRejectedValue(new Error('net-fail'));

      const oldState = makeVoiceState({ channelId: 'ch-1', channel: makeChannel('일반', []) });
      const newState = makeVoiceState({ channelId: null, channel: null });

      const promise = dispatcher.handleVoiceStateUpdate(oldState, newState);
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toBeUndefined();
      expect(apiClient.sendVoiceStateUpdate).toHaveBeenCalledTimes(3);
    });

    it('join 등 non-leave 이벤트는 실패해도 재시도하지 않는다(1회만 호출)', async () => {
      apiClient.sendVoiceStateUpdate.mockRejectedValue(new Error('net-fail'));

      const oldState = makeVoiceState({ channelId: null, channel: null });
      const member = makeMember();
      const newState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        member,
      });

      await dispatcher.handleVoiceStateUpdate(oldState, newState);

      expect(apiClient.sendVoiceStateUpdate).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────
  // C. 같은 유저 이벤트 순서 보장 (leave 재시도 지연 중 후속 이벤트 역전 방지)
  // ──────────────────────────────────────────────
  describe('전송 순서 보장', () => {
    it('leave 재시도가 지연되는 동안 같은 유저의 후속 join은 leave 전송 완료 후에 전송된다', async () => {
      const callOrder: string[] = [];
      let leaveAttempts = 0;

      apiClient.sendVoiceStateUpdate.mockImplementation(async (dto: VoiceStateUpdateDto) => {
        if (dto.eventType === 'leave') {
          leaveAttempts++;
          if (leaveAttempts < 2) {
            throw new Error('net-fail');
          }
          callOrder.push('leave');
          return;
        }
        callOrder.push(dto.eventType);
      });

      const leaveOld = makeVoiceState({ channelId: 'ch-1', channel: makeChannel('일반', []) });
      const leaveNew = makeVoiceState({ channelId: null, channel: null });
      const joinOld = makeVoiceState({ channelId: null, channel: null });
      const joinNew = makeVoiceState({
        channelId: 'ch-2',
        channel: makeChannel('신규', ['user-1']),
        member: makeMember(),
      });

      // 실제 재시도 지연(1초)을 기다리되, join은 leave 시작 직후(재시도 대기 중)에 발생시킨다.
      const leavePromise = dispatcher.handleVoiceStateUpdate(leaveOld, leaveNew);
      const joinPromise = dispatcher.handleVoiceStateUpdate(joinOld, joinNew);

      await Promise.all([leavePromise, joinPromise]);

      expect(callOrder).toEqual(['leave', 'join']);
    }, 10_000);
  });

  // ──────────────────────────────────────────────
  // D. 봇 계정 가드 (P1-6)
  // ──────────────────────────────────────────────
  describe('봇 계정 가드 (P1-6)', () => {
    it('newState.member.user.bot === true인 join은 전송하지 않는다', async () => {
      const oldState = makeVoiceState({ channelId: null, channel: null });
      const botMember = makeMember({ user: { bot: true } as GuildMember['user'] });
      const newState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        member: botMember,
      });

      await dispatcher.handleVoiceStateUpdate(oldState, newState);

      expect(apiClient.sendVoiceStateUpdate).not.toHaveBeenCalled();
    });

    it('oldState.member.user.bot === true이고 newState.member === null인 leave는 전송하지 않는다(폴백 검증)', async () => {
      const botMember = makeMember({ user: { bot: true } as GuildMember['user'] });
      const oldState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', []),
        member: botMember,
      });
      const newState = makeVoiceState({ channelId: null, channel: null, member: null });

      await dispatcher.handleVoiceStateUpdate(oldState, newState);

      expect(apiClient.sendVoiceStateUpdate).not.toHaveBeenCalled();
    });

    it('양쪽 member가 모두 null인 leave는 전송된다(기존 동작 보존)', async () => {
      const oldState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', []),
        member: null,
      });
      const newState = makeVoiceState({ channelId: null, channel: null, member: null });

      await dispatcher.handleVoiceStateUpdate(oldState, newState);

      expect(apiClient.sendVoiceStateUpdate).toHaveBeenCalledOnce();
    });

    it('user.bot === false인 정상 유저는 전송된다', async () => {
      const oldState = makeVoiceState({ channelId: null, channel: null });
      const member = makeMember({ user: { bot: false } as GuildMember['user'] });
      const newState = makeVoiceState({
        channelId: 'ch-1',
        channel: makeChannel('일반', ['user-1']),
        member,
      });

      await dispatcher.handleVoiceStateUpdate(oldState, newState);

      expect(apiClient.sendVoiceStateUpdate).toHaveBeenCalledOnce();
    });
  });
});
