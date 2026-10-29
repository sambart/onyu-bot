import { isNotFoundApiError, isTransientApiError } from '@onyu/bot-api-client';

/** 일시 실패 시 추가 재시도 횟수 (최초 시도 제외) — 총 3회 시도 */
export const CONFIG_LOOKUP_MAX_RETRIES = 2;
/** 재시도 기본 대기(ms). attempt 가 늘수록 2배 (300 → 600) */
export const CONFIG_LOOKUP_BASE_DELAY_MS = 300;
/** 지수 증가 배수 */
const BACKOFF_FACTOR = 2;
/** 지터 하한 비율 — 대기는 [delay*0.5, delay] 구간에서 무작위 (equal jitter) */
const JITTER_MIN_RATIO = 0.5;

export type ConfigLookupResult<T> =
  | { status: 'found'; config: T }
  | { status: 'none' }
  | { status: 'failed'; error: unknown };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function computeBackoffMs(retryIndex: number): number {
  const base = CONFIG_LOOKUP_BASE_DELAY_MS * BACKOFF_FACTOR ** retryIndex;
  return Math.round(base * (JITTER_MIN_RATIO + Math.random() * (1 - JITTER_MIN_RATIO)));
}

/**
 * newbie config 조회를 일시 실패에 한해 짧게 재시도한다 (감사 A5 / D3 a).
 * - 조회가 `null` 이면 미설정 → `none` (재시도 없음)
 * - 5xx·타임아웃·네트워크 등 일시 실패 → 최대 {@link CONFIG_LOOKUP_MAX_RETRIES}회 재시도
 * - 401 등 비일시 실패 → 재시도 없이 즉시 `failed`
 * 예외를 던지지 않는다 — 호출부가 `failed` 를 warn·실패 기록으로 처리한다.
 */
export async function lookupConfigWithRetry<T>(
  fetcher: () => Promise<T | null>,
): Promise<ConfigLookupResult<T>> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const config = await fetcher();
      return config ? { status: 'found', config } : { status: 'none' };
    } catch (error) {
      // SDK 가 404 를 null 로 흡수하지만, 다른 fetcher 가 404 를 던져도 "미설정"으로 동일 취급한다
      if (isNotFoundApiError(error)) return { status: 'none' };
      const isLastAttempt = attempt >= CONFIG_LOOKUP_MAX_RETRIES;
      if (isLastAttempt || !isTransientApiError(error)) {
        return { status: 'failed', error };
      }
      await sleep(computeBackoffMs(attempt));
    }
  }
}
