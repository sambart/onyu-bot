import type { BotApiClientService } from '@onyu/bot-api-client';
import { AxiosError } from 'axios';
import type { Message } from 'discord.js';
import type { Mocked } from 'vitest';

import {
  MESSAGE_FORWARD_RETRY_BASE_DELAY_MS,
  MESSAGE_FORWARD_RETRY_JITTER_MS,
} from '../message-forward-retry.util';
import { BotMessageCountHandler } from './bot-message-count.handler';

const MAX_RETRY_DELAY_MS = MESSAGE_FORWARD_RETRY_BASE_DELAY_MS + MESSAGE_FORWARD_RETRY_JITTER_MS;

/** status 미지정 = 응답 없는 네트워크 오류 */
function makeAxiosError(status: number | undefined): AxiosError {
  const error = new AxiosError('request failed');
  if (status !== undefined) {
    // 테스트 전용 — 응답 객체 중 isTransientApiError 가 읽는 status 만 채운다
    error.response = { status } as AxiosError['response'];
  }
  return error;
}

/** discord.js Message의 conditional 제네릭 타입을 우회하기 위한 테스트 전용 셰이프 */
interface FakeMessage {
  guildId: string | null;
  channelId: string;
  author: { id: string; username: string; bot: boolean; displayName: string };
  member: { displayName: string } | null;
  system: boolean;
  webhookId: string | null;
  channel: { name: string; isThread: () => boolean };
}

function makeMessage(overrides: Partial<FakeMessage> = {}): Message {
  const fake: FakeMessage = {
    guildId: 'guild-1',
    channelId: 'channel-1',
    author: { id: 'user-1', username: 'Alice', bot: false, displayName: 'Alice(글로벌)' },
    member: { displayName: '앨리스(서버)' },
    system: false,
    webhookId: null,
    channel: {
      name: 'general',
      isThread: () => false,
    },
    ...overrides,
  };
  return fake as unknown as Message;
}

describe('BotMessageCountHandler', () => {
  let handler: BotMessageCountHandler;
  let apiClient: Mocked<BotApiClientService>;

  beforeEach(() => {
    vi.useFakeTimers();
    apiClient = {
      sendMessageCounted: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<BotApiClientService>;
    handler = new BotMessageCountHandler(apiClient);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('guildId가 없으면 sendMessageCounted를 호출하지 않는다', async () => {
    const message = makeMessage({ guildId: null });

    await handler.handleMessageCreate(message);

    expect(apiClient.sendMessageCounted).not.toHaveBeenCalled();
  });

  it('author.bot이 true면 드롭한다', async () => {
    const message = makeMessage({
      author: { id: 'user-1', username: 'Alice', bot: true, displayName: 'Alice(글로벌)' },
    });

    await handler.handleMessageCreate(message);

    expect(apiClient.sendMessageCounted).not.toHaveBeenCalled();
  });

  it('system 메시지는 드롭한다', async () => {
    const message = makeMessage({ system: true });

    await handler.handleMessageCreate(message);

    expect(apiClient.sendMessageCounted).not.toHaveBeenCalled();
  });

  it('webhookId가 있으면 드롭한다', async () => {
    const message = makeMessage({ webhookId: 'webhook-1' });

    await handler.handleMessageCreate(message);

    expect(apiClient.sendMessageCounted).not.toHaveBeenCalled();
  });

  it('정상 메시지는 sendMessageCounted를 1회 호출하고 payload에 content를 포함하지 않는다', async () => {
    const message = makeMessage();

    await handler.handleMessageCreate(message);

    expect(apiClient.sendMessageCounted).toHaveBeenCalledTimes(1);
    const payload = apiClient.sendMessageCounted.mock.calls[0][0];
    expect(payload).toEqual({
      guildId: 'guild-1',
      channelId: 'channel-1',
      channelName: 'general',
      isThread: false,
      userId: 'user-1',
      userName: '앨리스(서버)',
    });
    expect(payload).not.toHaveProperty('content');
  });

  describe('userName 소스 교정 — 서버 표시명 우선 (R3, F-MSG-001)', () => {
    it('member.displayName이 있으면 그 값을 보낸다(서버 표시명 우선)', async () => {
      const message = makeMessage({
        member: { displayName: '서버닉네임' },
        author: { id: 'user-1', username: 'Alice', bot: false, displayName: '글로벌표시명' },
      });

      await handler.handleMessageCreate(message);

      const payload = apiClient.sendMessageCounted.mock.calls[0][0];
      expect(payload.userName).toBe('서버닉네임');
    });

    it('member가 null이면 author.displayName으로 폴백한다', async () => {
      const message = makeMessage({
        member: null,
        author: { id: 'user-1', username: 'Alice', bot: false, displayName: '글로벌표시명' },
      });

      await handler.handleMessageCreate(message);

      const payload = apiClient.sendMessageCounted.mock.calls[0][0];
      expect(payload.userName).toBe('글로벌표시명');
    });

    it('payload에 여전히 content가 없다(프라이버시 회귀 방어)', async () => {
      const message = makeMessage();

      await handler.handleMessageCreate(message);

      const payload = apiClient.sendMessageCounted.mock.calls[0][0];
      expect(payload).not.toHaveProperty('content');
    });
  });

  it('스레드 메시지는 isThread=true, channelId=스레드ID로 전달한다', async () => {
    const message = makeMessage({
      channelId: 'thread-1',
      channel: {
        name: 'thread-general',
        isThread: () => true,
      },
    });

    await handler.handleMessageCreate(message);

    const payload = apiClient.sendMessageCounted.mock.calls[0][0];
    expect(payload.isThread).toBe(true);
    expect(payload.channelId).toBe('thread-1');
  });

  it('일시 실패(네트워크 오류) 시 지연 후 1회 재시도한다', async () => {
    apiClient.sendMessageCounted
      .mockRejectedValueOnce(makeAxiosError(undefined))
      .mockResolvedValueOnce(undefined);
    const message = makeMessage();

    await handler.handleMessageCreate(message);
    expect(apiClient.sendMessageCounted).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(MAX_RETRY_DELAY_MS);

    expect(apiClient.sendMessageCounted).toHaveBeenCalledTimes(2);
  });

  it('재시도까지 실패하면 더 이상 재시도하지 않고 drop한다', async () => {
    apiClient.sendMessageCounted.mockRejectedValue(makeAxiosError(503));
    const message = makeMessage();

    await handler.handleMessageCreate(message);
    await vi.advanceTimersByTimeAsync(MAX_RETRY_DELAY_MS * 3);

    expect(apiClient.sendMessageCounted).toHaveBeenCalledTimes(2);
  });

  it('4xx 는 재시도하지 않는다', async () => {
    apiClient.sendMessageCounted.mockRejectedValue(makeAxiosError(400));
    const message = makeMessage();

    await handler.handleMessageCreate(message);
    await vi.advanceTimersByTimeAsync(MAX_RETRY_DELAY_MS * 3);

    expect(apiClient.sendMessageCounted).toHaveBeenCalledTimes(1);
  });
});
