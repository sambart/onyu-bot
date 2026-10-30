import type { BotApiClientService } from '@onyu/bot-api-client';
import { AxiosError } from 'axios';
import type { Message } from 'discord.js';
import type { Mocked } from 'vitest';

import {
  MESSAGE_FORWARD_RETRY_BASE_DELAY_MS,
  MESSAGE_FORWARD_RETRY_JITTER_MS,
} from '../message-forward-retry.util';
import { BotStickyMessageHandler } from './bot-sticky-message.handler';

const MAX_RETRY_DELAY_MS = MESSAGE_FORWARD_RETRY_BASE_DELAY_MS + MESSAGE_FORWARD_RETRY_JITTER_MS;

function makeAxiosError(status: number | undefined): AxiosError {
  const error = new AxiosError('request failed');
  if (status !== undefined) {
    // 테스트 전용 — isTransientApiError 가 읽는 status 만 채운다
    error.response = { status } as AxiosError['response'];
  }
  return error;
}

function makeMessage(guildId: string | null = 'guild-1'): Message {
  const fake = {
    guildId,
    channelId: 'channel-1',
    id: 'message-1',
    author: { id: 'user-1', bot: false },
  };
  // discord.js Message 의 conditional 제네릭 우회 — 핸들러가 읽는 필드만 채운 테스트 셰이프
  return fake as unknown as Message;
}

describe('BotStickyMessageHandler', () => {
  let handler: BotStickyMessageHandler;
  let apiClient: Mocked<BotApiClientService>;

  beforeEach(() => {
    vi.useFakeTimers();
    apiClient = {
      sendMessageCreated: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<BotApiClientService>;
    handler = new BotStickyMessageHandler(apiClient);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('길드 밖 메시지는 전달하지 않는다', async () => {
    await handler.handleMessageCreate(makeMessage(null));

    expect(apiClient.sendMessageCreated).not.toHaveBeenCalled();
  });

  it('정상 메시지는 payload 를 1회 전달한다', async () => {
    await handler.handleMessageCreate(makeMessage());

    expect(apiClient.sendMessageCreated).toHaveBeenCalledWith({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'message-1',
      authorId: 'user-1',
      isBot: false,
    });
  });

  it('5xx 는 1회 재시도한다', async () => {
    apiClient.sendMessageCreated
      .mockRejectedValueOnce(makeAxiosError(502))
      .mockResolvedValueOnce(undefined);

    await handler.handleMessageCreate(makeMessage());
    await vi.advanceTimersByTimeAsync(MAX_RETRY_DELAY_MS);

    expect(apiClient.sendMessageCreated).toHaveBeenCalledTimes(2);
  });

  it('4xx 는 재시도하지 않는다', async () => {
    apiClient.sendMessageCreated.mockRejectedValue(makeAxiosError(401));

    await handler.handleMessageCreate(makeMessage());
    await vi.advanceTimersByTimeAsync(MAX_RETRY_DELAY_MS * 3);

    expect(apiClient.sendMessageCreated).toHaveBeenCalledTimes(1);
  });
});
