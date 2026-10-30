import { AxiosError } from 'axios';

import {
  computeMessageForwardRetryDelayMs,
  forwardWithTransientRetry,
  MESSAGE_FORWARD_RETRY_BASE_DELAY_MS,
  MESSAGE_FORWARD_RETRY_JITTER_MS,
} from './message-forward-retry.util';

const MAX_DELAY_MS = MESSAGE_FORWARD_RETRY_BASE_DELAY_MS + MESSAGE_FORWARD_RETRY_JITTER_MS;

function makeAxiosError(status: number | undefined): AxiosError {
  const error = new AxiosError('request failed');
  if (status !== undefined) {
    // 테스트 전용 — isTransientApiError 가 읽는 status 만 채운다
    error.response = { status } as AxiosError['response'];
  }
  return error;
}

describe('forwardWithTransientRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('성공하면 재시도·실패 콜백 없이 1회 호출한다', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const onFailure = vi.fn();

    await forwardWithTransientRetry(send, onFailure);
    await vi.advanceTimersByTimeAsync(MAX_DELAY_MS * 2);

    expect(send).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it.each([500, 503, 408, 429, undefined])('status=%s 는 1회 재시도한다', async (status) => {
    const send = vi.fn().mockRejectedValueOnce(makeAxiosError(status)).mockResolvedValue(undefined);
    const onFailure = vi.fn();

    await forwardWithTransientRetry(send, onFailure);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MAX_DELAY_MS);

    expect(send).toHaveBeenCalledTimes(2);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404])(
    'status=%s 는 재시도 없이 즉시 실패 콜백을 호출한다',
    async (status) => {
      const error = makeAxiosError(status);
      const send = vi.fn().mockRejectedValue(error);
      const onFailure = vi.fn();

      await forwardWithTransientRetry(send, onFailure);
      await vi.advanceTimersByTimeAsync(MAX_DELAY_MS * 2);

      expect(send).toHaveBeenCalledTimes(1);
      expect(onFailure).toHaveBeenCalledWith(error);
    },
  );

  it('재시도도 실패하면 실패 콜백을 호출하고 더 재시도하지 않는다', async () => {
    const error = makeAxiosError(503);
    const send = vi.fn().mockRejectedValue(error);
    const onFailure = vi.fn();

    await forwardWithTransientRetry(send, onFailure);
    await vi.advanceTimersByTimeAsync(MAX_DELAY_MS * 3);

    expect(send).toHaveBeenCalledTimes(2);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(error);
  });

  it('재시도는 기본 대기 이전에는 실행되지 않는다', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const send = vi.fn().mockRejectedValueOnce(makeAxiosError(500)).mockResolvedValue(undefined);

    await forwardWithTransientRetry(send, vi.fn());
    await vi.advanceTimersByTimeAsync(MESSAGE_FORWARD_RETRY_BASE_DELAY_MS - 1);
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('computeMessageForwardRetryDelayMs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('지터 하한은 기본 대기, 상한은 기본 대기 + 지터 미만이다', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(computeMessageForwardRetryDelayMs()).toBe(MESSAGE_FORWARD_RETRY_BASE_DELAY_MS);

    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(computeMessageForwardRetryDelayMs()).toBeLessThan(MAX_DELAY_MS);
  });
});
