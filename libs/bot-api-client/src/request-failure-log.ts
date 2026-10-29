import { isAxiosError } from 'axios';

const HTTP_CLIENT_ERROR_MIN = 400;
const HTTP_SERVER_ERROR_MIN = 500;
const MAX_MESSAGE_LENGTH = 300;

export type BotApiLogLevel = 'warn' | 'error';

/** 봇→API 요청 실패 로그 페이로드. axios error/config/headers(Authorization) 는 절대 포함하지 않는다. */
export interface BotApiFailureLog {
  event: string;
  method: string;
  path: string;
  status: number | null;
  code: string | null;
  message: string;
}

export interface BotApiFailureReport {
  level: BotApiLogLevel;
  payload: BotApiFailureLog;
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readResponseBody(data: unknown): { code: string | null; message: string | null } {
  if (typeof data !== 'object' || data === null) return { code: null, message: null };
  const body = data as Record<string, unknown>;
  const rawMessage = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  return { code: pickString(body.code), message: pickString(rawMessage) };
}

/**
 * 요청 실패를 로그 페이로드로 요약한다.
 * - 4xx(정상 흐름 포함: name-input 404, duo 400, 429)는 warn, 5xx·네트워크·타임아웃은 error.
 * - nestjs-pino 는 `logger.error(msg, err)` 의 err 를 버리므로 호출측은 이 페이로드를 첫 인자(객체)로 넘긴다.
 */
export function buildBotApiFailureReport(
  method: string,
  path: string,
  err: unknown,
): BotApiFailureReport {
  const base = { event: `[BOT-API] ${method} failed`, method, path };

  if (isAxiosError(err)) {
    const status = err.response?.status ?? null;
    const body = readResponseBody(err.response?.data);
    const isClientError =
      status !== null && status >= HTTP_CLIENT_ERROR_MIN && status < HTTP_SERVER_ERROR_MIN;
    return {
      level: isClientError ? 'warn' : 'error',
      payload: {
        ...base,
        status,
        // 응답 본문 code 가 없으면 axios 코드(ECONNABORTED·ECONNREFUSED 등)로 원인을 구분한다
        code: body.code ?? pickString(err.code),
        message: (body.message ?? err.message).slice(0, MAX_MESSAGE_LENGTH),
      },
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    level: 'error',
    payload: { ...base, status: null, code: null, message: message.slice(0, MAX_MESSAGE_LENGTH) },
  };
}
