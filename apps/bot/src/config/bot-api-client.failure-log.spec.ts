/**
 * BotApiClientService 공통 요청 로거 — 실패 로그가 구조화 객체로 남는지 검증한다 (감사 A1 · H4).
 *
 * nestjs-pino 는 `logger.error(msg, err)` 의 err 를 버리므로, 로거 첫 인자로 넘긴 객체의 필드가
 * 실제로 남는지를 실 axios + 실 로컬 HTTP 서버로 확인한다. `libs/bot-api-client` 는 자체 vitest
 * 인프라가 없어 `apps/bot/vitest.config.ts` 의 소스 alias 를 이용한다(admin-assist-recommendation.sdk.spec.ts 선례).
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { HttpService } from '@nestjs/axios';
import { type Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

const SECRET_KEY = 'super-secret-bot-api-key';
const USER_ID = '222222222222222222';

async function startServer(
  status: number,
  body: unknown,
): Promise<{ baseURL: string; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseURL: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let warnSpy: MockInstance<Logger['warn']>;
let errorSpy: MockInstance<Logger['error']>;

function makeService(baseURL: string): BotApiClientService {
  // 실 SDK 와 같이 Authorization 헤더를 인스턴스 기본값으로 넣어 유출 여부를 검증할 수 있게 한다
  const axiosInstance = axios.create({
    baseURL,
    headers: { Authorization: `Bearer ${SECRET_KEY}` },
  });
  const service = new BotApiClientService(new HttpService(axiosInstance));
  // SDK 가 해석하는 @nestjs/common 사본이 이 스펙과 다를 수 있어 prototype 이 아니라 인스턴스 로거를 감시한다
  // (private 필드 접근이라 as 단언 필요)
  const { logger } = service as unknown as { logger: Logger };
  warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  return service;
}

describe('BotApiClientService 실패 로그 구조화 (A1)', () => {
  let closeServer: (() => Promise<void>) | undefined;

  beforeEach(() => {
    closeServer = undefined;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await closeServer?.();
  });

  it('5xx 는 error 레벨로 method·path·status·code·message 를 객체로 남긴다', async () => {
    const { baseURL, close } = await startServer(500, {
      statusCode: 500,
      code: 'INTERNAL',
      message: 'db down',
    });
    closeServer = close;

    await expect(makeService(baseURL).getUserLocale(USER_ID)).rejects.toThrow();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      method: 'GET',
      path: `/bot-api/locale/user/${USER_ID}`,
      status: 500,
      code: 'INTERNAL',
      message: 'db down',
    });
  });

  it('4xx(정상 흐름 404·429 등)는 warn 레벨이고 error 는 호출되지 않는다', async () => {
    const { baseURL, close } = await startServer(404, { statusCode: 404, message: 'not found' });
    closeServer = close;

    await expect(makeService(baseURL).getUserLocale(USER_ID)).rejects.toThrow();

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toMatchObject({ status: 404, message: 'not found' });
  });

  it('401 도 4xx 이므로 warn 이지만 status 가 남아 인증 실패를 식별할 수 있다', async () => {
    const { baseURL, close } = await startServer(401, { statusCode: 401, message: 'Unauthorized' });
    closeServer = close;

    await expect(makeService(baseURL).getUserLocale(USER_ID)).rejects.toThrow();

    expect(warnSpy.mock.calls[0][0]).toMatchObject({ status: 401 });
  });

  it('네트워크 실패(연결 거부)는 error 레벨이고 status 는 null, code 에 원인이 남는다', async () => {
    const { baseURL, close } = await startServer(200, {});
    await close(); // 포트를 닫아 ECONNREFUSED 를 유발한다

    await expect(makeService(baseURL).getUserLocale(USER_ID)).rejects.toThrow();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toMatchObject({ status: null, code: 'ECONNREFUSED' });
  });

  it('로그 페이로드에 Authorization 헤더·BOT_API_KEY·axios config 가 직렬화되지 않는다', async () => {
    const { baseURL, close } = await startServer(500, { message: 'boom' });
    closeServer = close;

    await expect(makeService(baseURL).getUserLocale(USER_ID)).rejects.toThrow();

    const serialized = JSON.stringify(errorSpy.mock.calls);
    expect(serialized).not.toContain(SECRET_KEY);
    expect(serialized.toLowerCase()).not.toContain('authorization');
  });
});
