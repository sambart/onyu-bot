import type { BotApiClientService } from '@onyu/bot-api-client';
import type { Message } from 'discord.js';
import type { Mocked } from 'vitest';

import { BotMessageCountHandler } from './bot-message-count.handler';

const RETRY_DELAY_MS = 1000;

/** discord.js Message의 conditional 제네릭 타입을 우회하기 위한 테스트 전용 셰이프 */
interface FakeMessage {
  guildId: string | null;
  channelId: string;
  author: { id: string; username: string; bot: boolean };
  system: boolean;
  webhookId: string | null;
  channel: { name: string; isThread: () => boolean };
}

function makeMessage(overrides: Partial<FakeMessage> = {}): Message {
  const fake: FakeMessage = {
    guildId: 'guild-1',
    channelId: 'channel-1',
    author: { id: 'user-1', username: 'Alice', bot: false },
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
      author: { id: 'user-1', username: 'Alice', bot: true },
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
      userName: 'Alice',
    });
    expect(payload).not.toHaveProperty('content');
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

  it('전송 실패 시 1초 후 1회 재시도한다', async () => {
    apiClient.sendMessageCounted
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(undefined);
    const message = makeMessage();

    await handler.handleMessageCreate(message);
    expect(apiClient.sendMessageCounted).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);

    expect(apiClient.sendMessageCounted).toHaveBeenCalledTimes(2);
  });

  it('재시도까지 실패하면 더 이상 재시도하지 않고 drop한다', async () => {
    apiClient.sendMessageCounted.mockRejectedValue(new Error('network error'));
    const message = makeMessage();

    await handler.handleMessageCreate(message);
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);

    expect(apiClient.sendMessageCounted).toHaveBeenCalledTimes(2);
  });
});
