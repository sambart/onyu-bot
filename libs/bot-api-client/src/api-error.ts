import { isAxiosError } from 'axios';

const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_REQUEST_TIMEOUT = 408;
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_MIN = 500;

/** axios 에러의 HTTP 상태 코드. 응답이 없는 네트워크 오류·타임아웃·비 axios 에러는 null. */
export function getApiErrorStatus(err: unknown): number | null {
  return isAxiosError(err) ? (err.response?.status ?? null) : null;
}

/** 404 — 리소스 부재(예: 미설정)를 뜻한다. 장애가 아니다. */
export function isNotFoundApiError(err: unknown): boolean {
  return getApiErrorStatus(err) === HTTP_STATUS_NOT_FOUND;
}

/**
 * 재시도할 가치가 있는 일시 실패인지 판별한다 — 5xx · 408 · 429 · 응답 없음(네트워크/타임아웃).
 * 401·403·400 같은 4xx 는 재시도해도 결과가 같으므로 false.
 */
export function isTransientApiError(err: unknown): boolean {
  if (!isAxiosError(err)) return false;
  const status = err.response?.status;
  if (status === undefined) return true;
  return (
    status >= HTTP_SERVER_ERROR_MIN ||
    status === HTTP_STATUS_REQUEST_TIMEOUT ||
    status === HTTP_STATUS_TOO_MANY_REQUESTS
  );
}
