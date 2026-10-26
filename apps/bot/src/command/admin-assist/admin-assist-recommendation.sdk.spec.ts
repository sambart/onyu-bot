/**
 * BotApiClientService.getAdminAssistRecommendation() — 실 axios + 실 로컬 HTTP 서버 통합
 * 테스트(endpoint-spec §5E-9 B11 — "SDK 전역 10초가 이 경로를 조용히 죽인다"실측 발견).
 *
 * 배경: `libs/bot-api-client` 는 자체 vitest 인프라가 없다(known gap — memory
 * onyu-welcome-canvas-track). 이 스펙은 `apps/bot/vitest.config.ts` 가 `@onyu/bot-api-client`
 * 를 소스 경로로 alias 하는 것을 이용해 `pnpm --filter @onyu/bot test` 로 함께 실행되게 한다.
 *
 * 🔒 픽스처 함정 회피 — "구현이 `{ timeout: ADMIN_ASSIST_RECOMMEND_TIMEOUT_MS }` 를
 * 전달한다"는 코드 표면만 assert하지 않는다(그건 구현과 같은 가정을 쓴 순환 검증이라 반증이
 * 안 된다). 대신 실제로 느리게 응답하는 로컬 HTTP 서버 + 실 axios 인스턴스로 **진짜
 * 타임아웃을 유발**해, per-request 타임아웃이 실제로 axios 에 전달·집행되는지와 그 결과가
 * 판별 가능한 형태(§5E-6 🟨 권고 ⓐ)로 번역되는지를 검증한다.
 *
 * 실 상수값(50_000ms)으로 기다리면 테스트가 50초씩 걸리므로, `ADMIN_ASSIST_RECOMMEND_TIMEOUT_MS`
 * "값"만 vi.mock 으로 축소한다(로직은 원본 그대로 — inactive-member.scheduler.spec.ts 관례,
 * `vi.mock('@onyu/shared', async (importOriginal) => ({ ...await importOriginal(), X: ... }))`).
 * 이렇게 해도 여전히 실 axios 가 실 setTimeout 으로 타임아웃을 집행하므로 "실제로 유발"의
 * 요건을 충족한다 — 축소되는 것은 숫자뿐, 타임아웃 메커니즘 자체는 목킹하지 않는다.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { HttpService } from '@nestjs/axios';
import type { GetAdminAssistRecommendationOptions } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import type * as sharedConstants from '@onyu/shared';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock 팩토리는 파일 최상단으로 호이스팅되어 일반 const 선언보다 먼저 실행된다 — 팩토리가
// 참조하는 값은 반드시 vi.hoisted()로 감싸야 TDZ(ReferenceError)를 피한다(vitest 공식 패턴).
const { MOCK_TIMEOUT_MS, SLOW_SERVER_DELAY_MS, FAST_ROUNDTRIP_BOUND_MS } = vi.hoisted(() => ({
  /** 실 상수(50_000ms)의 1/300 수준 — 테스트를 수백 ms 안에 끝내면서도 실 타임아웃을 유발한다 */
  MOCK_TIMEOUT_MS: 150,
  /** MOCK_TIMEOUT_MS 보다 뚜렷이 긴 서버 지연 — 타임아웃이 "진짜" 집행됐는지 구분하는 기준선 */
  SLOW_SERVER_DELAY_MS: 2_000,
  /** 정상 왕복(즉시 응답) 요청의 여유 상한 — CI 지터 흡수 */
  FAST_ROUNDTRIP_BOUND_MS: 1_000,
}));

vi.mock('@onyu/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof sharedConstants>();
  return { ...actual, ADMIN_ASSIST_RECOMMEND_TIMEOUT_MS: MOCK_TIMEOUT_MS };
});

// vi.mock은 파일 최상단으로 호이스팅되므로(vitest 관례 — inactive-member.scheduler.spec.ts와
// 동일 패턴) 위 static import(BotApiClientService)는 이미 목 상수가 반영된 모듈을 가져온다.

const BASE_OPTIONS: GetAdminAssistRecommendationOptions = {
  guildId: '111111111111111111',
  userId: '222222222222222222',
  queryText: '신규 멤버 환영 메시지 어떻게 설정해?',
};

/** req.on('close')로 클라이언트 abort 시 pending 타이머를 정리한다 — 테스트 간 dangling timer 방지 */
function delayedJsonHandler(delayMs: number, status: number, body: unknown): http.RequestListener {
  return (req, res) => {
    res.on('error', () => {
      /* 클라이언트가 이미 연결을 끊은 뒤의 쓰기 실패는 무시한다(타임아웃 시나리오의 정상 결과) */
    });
    const timer = setTimeout(() => {
      try {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      } catch {
        /* 클라이언트가 이미 연결을 끊음 */
      }
    }, delayMs);
    req.on('close', () => clearTimeout(timer));
  };
}

async function startServer(handler: http.RequestListener): Promise<{
  baseURL: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseURL: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function makeService(baseURL: string): InstanceType<typeof BotApiClientService> {
  const axiosInstance = axios.create({ baseURL });
  const httpService = new HttpService(axiosInstance);
  return new BotApiClientService(httpService);
}

describe('BotApiClientService.getAdminAssistRecommendation — 실 axios/실 서버 통합(B3·B7·B8·B11)', () => {
  let closeServer: (() => Promise<void>) | undefined;

  beforeEach(() => {
    closeServer = undefined;
  });

  afterEach(async () => {
    await closeServer?.();
  });

  it('B3 — 즉시 200 응답이면 { ok:true, data } 를 반환한다(정상 왕복)', async () => {
    const payload = { resultStatus: 'success', kind: 'setting', historyId: '1' };
    const { baseURL, close } = await startServer(delayedJsonHandler(0, 200, payload));
    closeServer = close;
    const service = makeService(baseURL);

    const result = await service.getAdminAssistRecommendation(BASE_OPTIONS);

    expect(result).toEqual({ ok: true, data: payload });
  });

  it('B8 — 429 + {reason:"quota_exhausted"} 이면 판별 가능한 quota_exhausted 결과로 번역한다(장애와 뭉개지지 않음)', async () => {
    // 🔒 픽스처는 실제 AllExceptionsFilter 봉투 형태여야 반증력이 있다 — code/params/errors 만
    // 최상위로 승격되고 reason 은 message 아래 그대로 남는다(apps/api all-exceptions.filter.ts
    // 39~60행, apps/api/test/admin-assist-bot-entrypoint.e2e-spec.ts 362행이 실 계약을 단언).
    // 최상위 { reason } 픽스처는 구현과 같은 가정을 쓴 순환 검증이라 이 회귀를 못 잡는다.
    const { baseURL, close } = await startServer(
      delayedJsonHandler(0, 429, {
        statusCode: 429,
        message: { reason: 'quota_exhausted' },
      }),
    );
    closeServer = close;
    const service = makeService(baseURL);

    const result = await service.getAdminAssistRecommendation(BASE_OPTIONS);

    expect(result).toEqual({ ok: false, reason: 'quota_exhausted' });
  });

  it('429 라도 reason이 quota_exhausted가 아니면 일반 오류(reason:"error")로 분류한다(스로틀 429와 혼동 방지)', async () => {
    const { baseURL, close } = await startServer(
      delayedJsonHandler(0, 429, { statusCode: 429, message: 'Too Many Requests' }),
    );
    closeServer = close;
    const service = makeService(baseURL);

    const result = await service.getAdminAssistRecommendation(BASE_OPTIONS);

    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  it('429 + message.reason 이 quota_exhausted 가 아닌 다른 값이면 error 로 분류한다(오탐 방지)', async () => {
    const { baseURL, close } = await startServer(
      delayedJsonHandler(0, 429, { statusCode: 429, message: { reason: 'rate_limited' } }),
    );
    closeServer = close;
    const service = makeService(baseURL);

    const result = await service.getAdminAssistRecommendation(BASE_OPTIONS);

    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  it('서버 5xx 응답이면 { ok:false, reason:"error" } 를 반환한다(throw하지 않음)', async () => {
    const { baseURL, close } = await startServer(delayedJsonHandler(0, 500, { error: 'boom' }));
    closeServer = close;
    const service = makeService(baseURL);

    const result = await service.getAdminAssistRecommendation(BASE_OPTIONS);

    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  // ─── B11 — 🔒 실제로 타임아웃을 유발한 검증(픽스처 함정 회피) ─────────────────

  it(
    'B11 — 서버가 per-request 타임아웃보다 오래 응답하지 않으면 실제로 타임아웃이 걸려 ' +
      '{ ok:false, reason:"error" } 를 반환한다(hang 없음, throw 없음)',
    async () => {
      const { baseURL, close } = await startServer(
        delayedJsonHandler(SLOW_SERVER_DELAY_MS, 200, { resultStatus: 'success' }),
      );
      closeServer = close;
      const service = makeService(baseURL);

      const startedAt = Date.now();
      const result = await service.getAdminAssistRecommendation(BASE_OPTIONS);
      const elapsedMs = Date.now() - startedAt;

      expect(result).toEqual({ ok: false, reason: 'error' });
      // 🔒 핵심 단언 — per-request 타임아웃(MOCK_TIMEOUT_MS)이 실제로 axios 에 전달·집행됐다는
      // 증거: 서버 지연(SLOW_SERVER_DELAY_MS=2000ms)을 끝까지 기다리지 않고 훨씬 짧게(설정값
      // 근방) 끊겼다. 여기서 실패한다면 config.timeout 이 axios 요청에 실제로 반영되지 않고
      // 있다는 뜻이며 — endpoint-spec §5E-9 가 경고한 "조용한 실패 모드"(쿼터 소모 + 이력
      // success + 사용자 오류)가 실제로 재현될 상태라는 뜻이다.
      expect(elapsedMs).toBeLessThan(SLOW_SERVER_DELAY_MS - 500);
      expect(elapsedMs).toBeGreaterThanOrEqual(MOCK_TIMEOUT_MS - 50);
    },
    SLOW_SERVER_DELAY_MS + FAST_ROUNDTRIP_BOUND_MS,
  );

  it('B11 — 응답이 timeout 안에 오면(정상 지연) 타임아웃 없이 정상 데이터를 반환한다(오탐 없음 대조군)', async () => {
    const fastDelay = Math.floor(MOCK_TIMEOUT_MS / 3);
    const payload = { resultStatus: 'success', kind: 'recipe' };
    const { baseURL, close } = await startServer(delayedJsonHandler(fastDelay, 200, payload));
    closeServer = close;
    const service = makeService(baseURL);

    const result = await service.getAdminAssistRecommendation(BASE_OPTIONS);

    expect(result).toEqual({ ok: true, data: payload });
  });
});
