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
});
