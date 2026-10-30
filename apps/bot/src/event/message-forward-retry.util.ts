import { isTransientApiError } from '@onyu/bot-api-client';

/** 재시도 횟수 — 최초 시도 제외 1회 (총 2회 시도) */
export const MESSAGE_FORWARD_MAX_RETRIES = 1;
/** 재시도 기본 대기(ms) */
export const MESSAGE_FORWARD_RETRY_BASE_DELAY_MS = 1000;
/** 재시도 지터 상한(ms) — 대기는 [BASE, BASE + JITTER) 구간 무작위. 장애 직후 재시도 동시 폭주 완화 */
export const MESSAGE_FORWARD_RETRY_JITTER_MS = 500;

/**
 * 재시도 전 대기 시간(ms)을 계산한다 — 기본 대기에 균등 난수 지터를 더한다.
 * 반환값은 정수이며 구간 `[MESSAGE_FORWARD_RETRY_BASE_DELAY_MS, BASE + MESSAGE_FORWARD_RETRY_JITTER_MS)`
 * 에 속한다(상한 미포함). 장애 직후 여러 전달이 같은 시각에 재시도하며 몰리는 것을 흩뜨리기 위해 호출마다
 * 값이 달라진다.
 */
export function computeMessageForwardRetryDelayMs(): number {
  return (
    MESSAGE_FORWARD_RETRY_BASE_DELAY_MS +
    Math.floor(Math.random() * MESSAGE_FORWARD_RETRY_JITTER_MS)
  );
}

/**
 * messageCreate → API 전달을 일시 실패(5xx·408·429·타임아웃·네트워크)에 한해 1회 재시도한다.
 * 4xx 등 비일시 실패는 재시도해도 결과가 같아 즉시 포기한다(`onFailure`).
 * 최초 시도는 await 하고, 재시도는 지연 후 백그라운드로 수행한다(이벤트 루프 점유 방지).
 */
export async function forwardWithTransientRetry(
  send: () => Promise<void>,
  onFailure: (error: unknown) => void,
): Promise<void> {
  try {
    await send();
  } catch (error) {
    if (!isTransientApiError(error)) {
      onFailure(error);
      return;
    }
    setTimeout(() => {
      send().catch(onFailure);
    }, computeMessageForwardRetryDelayMs());
  }
}
