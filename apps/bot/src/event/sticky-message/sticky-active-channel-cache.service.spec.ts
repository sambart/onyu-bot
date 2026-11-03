import type { BotApiClientService } from '@onyu/bot-api-client';
import { AxiosError } from 'axios';
import type { Mocked } from 'vitest';

import {
  STICKY_ACTIVE_CHANNELS_FAILURE_BACKOFF_MS,
  STICKY_ACTIVE_CHANNELS_TTL_MS,
  StickyActiveChannelCache,
} from './sticky-active-channel-cache.service';

function makeResponse(channelIds: string[]) {
  return { ok: true, data: { channelIds } };
}

describe('StickyActiveChannelCache', () => {
  let cache: StickyActiveChannelCache;
  let apiClient: Mocked<BotApiClientService>;

  beforeEach(() => {
    vi.useFakeTimers();
    apiClient = {
      getStickyActiveChannels: vi.fn().mockResolvedValue(makeResponse(['ch-1'])),
    } as unknown as Mocked<BotApiClientService>;
    cache = new StickyActiveChannelCache(apiClient);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('미스 시 1회 조회하고 TTL 안에서는 재조회하지 않는다', async () => {
    await expect(cache.shouldForward('g1', 'ch-1')).resolves.toBe(true);
    await expect(cache.shouldForward('g1', 'ch-2')).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(STICKY_ACTIVE_CHANNELS_TTL_MS - 1);
    await cache.shouldForward('g1', 'ch-1');

    expect(apiClient.getStickyActiveChannels).toHaveBeenCalledTimes(1);
    expect(apiClient.getStickyActiveChannels).toHaveBeenCalledWith('g1');
  });

  it('TTL 만료 후에는 다시 조회하고 새 집합을 반영한다', async () => {
    await cache.shouldForward('g1', 'ch-2');
    apiClient.getStickyActiveChannels.mockResolvedValue(makeResponse(['ch-2']));

    await vi.advanceTimersByTimeAsync(STICKY_ACTIVE_CHANNELS_TTL_MS);

    await expect(cache.shouldForward('g1', 'ch-2')).resolves.toBe(true);
    expect(apiClient.getStickyActiveChannels).toHaveBeenCalledTimes(2);
  });

  it('동시 미스는 조회 1회로 합쳐진다', async () => {
    const results = await Promise.all([
      cache.shouldForward('g1', 'ch-1'),
      cache.shouldForward('g1', 'ch-1'),
      cache.shouldForward('g1', 'ch-9'),
    ]);

    expect(results).toEqual([true, true, false]);
    expect(apiClient.getStickyActiveChannels).toHaveBeenCalledTimes(1);
  });

  it('길드별로 독립 캐시한다', async () => {
    await cache.shouldForward('g1', 'ch-1');
    await cache.shouldForward('g2', 'ch-1');

    expect(apiClient.getStickyActiveChannels).toHaveBeenCalledTimes(2);
  });

  it('빈 집합도 캐시한다(negative cache)', async () => {
    apiClient.getStickyActiveChannels.mockResolvedValue(makeResponse([]));

    await expect(cache.shouldForward('g1', 'ch-1')).resolves.toBe(false);
    await expect(cache.shouldForward('g1', 'ch-1')).resolves.toBe(false);

    expect(apiClient.getStickyActiveChannels).toHaveBeenCalledTimes(1);
  });

  it('조회 실패 시 fail-open(true) 하고 백오프 동안 재조회하지 않으며 이후 재시도한다', async () => {
    apiClient.getStickyActiveChannels.mockRejectedValueOnce(new Error('boom'));

    await expect(cache.shouldForward('g1', 'ch-9')).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(STICKY_ACTIVE_CHANNELS_FAILURE_BACKOFF_MS - 1);
    await expect(cache.shouldForward('g1', 'ch-9')).resolves.toBe(true);
    expect(apiClient.getStickyActiveChannels).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(cache.shouldForward('g1', 'ch-9')).resolves.toBe(false);
    expect(apiClient.getStickyActiveChannels).toHaveBeenCalledTimes(2);
  });

  it('404(구 API)도 fail-open 한다', async () => {
    const error = new AxiosError('not found');
    error.response = { status: 404 } as AxiosError['response'];
    apiClient.getStickyActiveChannels.mockRejectedValue(error);

    await expect(cache.shouldForward('g1', 'ch-1')).resolves.toBe(true);
  });

  it.each([
    ['data.channelIds 부재', { ok: true, data: {} }],
    ['channelIds 가 문자열', { ok: true, data: { channelIds: 'ch-1' } }],
    ['channelIds 에 비문자열 포함', { ok: true, data: { channelIds: ['ch-1', 2] } }],
  ])(
    '응답 형태 이상(%s)은 빈 집합으로 캐시하지 않고 fail-open + 백오프한다',
    async (_label, body) => {
      apiClient.getStickyActiveChannels.mockResolvedValue(body as never);

      await expect(cache.shouldForward('g1', 'ch-1')).resolves.toBe(true);
      await expect(cache.shouldForward('g1', 'ch-9')).resolves.toBe(true);
      expect(apiClient.getStickyActiveChannels).toHaveBeenCalledTimes(1);
    },
  );

  it('클라이언트가 동기 throw 해도 fail-open 하고 inflight 가 남지 않아 백오프 후 재조회한다', async () => {
    apiClient.getStickyActiveChannels.mockImplementationOnce(() => {
      throw new Error('sync boom');
    });

    await expect(cache.shouldForward('g1', 'ch-1')).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(STICKY_ACTIVE_CHANNELS_FAILURE_BACKOFF_MS);

    await expect(cache.shouldForward('g1', 'ch-9')).resolves.toBe(false);
    expect(apiClient.getStickyActiveChannels).toHaveBeenCalledTimes(2);
  });

  it('동시 실패도 조회 1회로 합쳐지고 모두 fail-open 한다', async () => {
    apiClient.getStickyActiveChannels.mockRejectedValue(new Error('boom'));

    const results = await Promise.all([
      cache.shouldForward('g1', 'ch-1'),
      cache.shouldForward('g1', 'ch-2'),
    ]);

    expect(results).toEqual([true, true]);
    expect(apiClient.getStickyActiveChannels).toHaveBeenCalledTimes(1);
  });
});
