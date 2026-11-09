/**
 * BotApiClientService 제어 패널 메서드 3종(autoChannelControlCheck / autoChannelControlUserLimit /
 * autoChannelControlLock) — 실 axios + 실 로컬 HTTP 서버 통합 테스트 (F-VOICE-149, plan §3 U1 #9).
 *
 * `libs/bot-api-client` 는 자체 vitest 인프라가 없다(known gap) — `admin-assist-recommendation.sdk.spec.ts`
 * 와 같이 `apps/bot/vitest.config.ts` 의 소스 alias 를 이용해 `pnpm --filter @onyu/bot test` 로 함께 실행한다.
 * 요청 URL·쿼리·본문과 AC3 의 1500ms per-request 타임아웃이 실제 HTTP 왕복에서 집행되는지 검증한다
 * (구현 상수를 복사한 단언이 아니라 느리게 응답하는 서버로 타임아웃을 실제로 유발).
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { HttpService } from '@nestjs/axios';
import { BotApiClientService } from '@onyu/bot-api-client';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface Captured {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: unknown;
}

/** 요청을 기록하고 지정한 지연 뒤 JSON 응답하는 서버 */
async function startServer(options: { delayMs?: number; status?: number; body?: unknown } = {}) {
  const captured: Captured[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      captured.push({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: raw ? JSON.parse(raw) : undefined,
      });
      const timer = setTimeout(() => {
        try {
          res.writeHead(options.status ?? 200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(options.body ?? { ok: true }));
        } catch {
          /* 클라이언트가 이미 연결을 끊음(타임아웃 시나리오) */
        }
      }, options.delayMs ?? 0);
      // 요청 본문 수신 완료 시에도 req 'close' 가 발생하므로, 연결 종료는 res 'close' 로 감지한다
      res.on('close', () => clearTimeout(timer));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseURL: `http://127.0.0.1:${port}`,
    captured,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function makeService(baseURL: string): InstanceType<typeof BotApiClientService> {
  return new BotApiClientService(new HttpService(axios.create({ baseURL })));
}

describe('BotApiClientService — 자동방 제어 패널 (AC3·AC4·AC5)', () => {
  let closeServer: (() => Promise<void>) | undefined;

  beforeEach(() => {
    closeServer = undefined;
  });

  afterEach(async () => {
    await closeServer?.();
  });

  describe('autoChannelControlCheck (GET)', () => {
    it('GET /bot-api/auto-channel/control/check 로 4개 쿼리를 보내고 응답 본문을 그대로 반환한다', async () => {
      const response = { allowed: true, state: { locked: false, userLimit: 7 } };
      const { baseURL, captured, close } = await startServer({ body: response });
      closeServer = close;

      const result = await makeService(baseURL).autoChannelControlCheck({
        guildId: '111111111111111111',
        userId: '222222222222222222',
        channelId: '333333333333333333',
        voiceChannelId: '333333333333333333',
      });

      expect(result).toEqual(response);
      expect(captured).toHaveLength(1);
      expect(captured[0].method).toBe('GET');
      const url = new URL(captured[0].url, 'http://x');
      expect(url.pathname).toBe('/bot-api/auto-channel/control/check');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        guildId: '111111111111111111',
        userId: '222222222222222222',
        channelId: '333333333333333333',
        voiceChannelId: '333333333333333333',
      });
    });

    it.each([[null], [undefined]])(
      'voiceChannelId=%s(방 밖)이면 쿼리에서 생략한다 — 문자열 "null" 로 보내지 않는다',
      async (voiceChannelId) => {
        const { baseURL, captured, close } = await startServer({ body: { allowed: false } });
        closeServer = close;

        await makeService(baseURL).autoChannelControlCheck({
          guildId: 'g',
          userId: 'u',
          channelId: 'c',
          voiceChannelId,
        });

        const url = new URL(captured[0].url, 'http://x');
        expect(url.searchParams.has('voiceChannelId')).toBe(false);
        expect(url.search).not.toContain('null');
        expect(url.search).not.toContain('undefined');
      },
    );

    it('특수문자가 든 값도 쿼리로 안전하게 인코딩된다', async () => {
      const { baseURL, captured, close } = await startServer();
      closeServer = close;

      await makeService(baseURL).autoChannelControlCheck({
        guildId: 'g&x=1',
        userId: 'u u',
        channelId: 'c#1',
      });

      const url = new URL(captured[0].url, 'http://x');
      expect(url.searchParams.get('guildId')).toBe('g&x=1');
      expect(url.searchParams.get('userId')).toBe('u u');
      expect(url.searchParams.get('channelId')).toBe('c#1');
      expect(url.searchParams.has('x')).toBe(false);
    });

    it('EC-ACNI-92 — 1.5초 안에 응답하지 않으면 실제로 타임아웃으로 reject 한다(모달 3초 데드라인 보호)', async () => {
      const { baseURL, close } = await startServer({ delayMs: 3_000 });
      closeServer = close;
      const startedAt = Date.now();

      await expect(
        makeService(baseURL).autoChannelControlCheck({ guildId: 'g', userId: 'u', channelId: 'c' }),
      ).rejects.toThrow();

      const elapsed = Date.now() - startedAt;
      expect(elapsed).toBeGreaterThanOrEqual(1_400);
      expect(elapsed).toBeLessThan(2_900);
    }, 10_000);

    it('서버 5xx 는 reject 된다(호출측이 모달 없이 안내)', async () => {
      const { baseURL, close } = await startServer({ status: 500, body: { message: 'boom' } });
      closeServer = close;

      await expect(
        makeService(baseURL).autoChannelControlCheck({ guildId: 'g', userId: 'u', channelId: 'c' }),
      ).rejects.toThrow();
    });
  });

  describe('autoChannelControlUserLimit (POST)', () => {
    it('POST /bot-api/auto-channel/control/user-limit 로 본문을 그대로 보내고 응답을 반환한다', async () => {
      const response = {
        action: 'updated',
        code: 'AUTO_CHANNEL_CONTROL_LIMIT_UPDATED',
        message: 'ok',
      };
      const { baseURL, captured, close } = await startServer({ body: response });
      closeServer = close;
      const dto = {
        guildId: '111111111111111111',
        userId: '222222222222222222',
        channelId: '333333333333333333',
        voiceChannelId: null,
        userLimitInput: '7',
      };

      const result = await makeService(baseURL).autoChannelControlUserLimit(dto);

      expect(result).toEqual(response);
      expect(captured[0].method).toBe('POST');
      expect(captured[0].url).toBe('/bot-api/auto-channel/control/user-limit');
      expect(captured[0].body).toEqual(dto);
    });

    it('AC3 의 1.5초 타임아웃이 적용되지 않는다 — deferReply 이후 호출이므로 느린 응답도 기다린다', async () => {
      const { baseURL, close } = await startServer({ delayMs: 1_800, body: { action: 'updated' } });
      closeServer = close;

      const result = await makeService(baseURL).autoChannelControlUserLimit({
        guildId: 'g',
        userId: 'u',
        channelId: 'c',
        voiceChannelId: 'c',
        userLimitInput: '3',
      });

      expect(result).toEqual({ action: 'updated' });
    }, 10_000);

    it('서버 400(봇 버그) 은 reject 된다', async () => {
      const { baseURL, close } = await startServer({
        status: 400,
        body: { code: 'VALIDATION_FAILED' },
      });
      closeServer = close;

      await expect(
        makeService(baseURL).autoChannelControlUserLimit({
          guildId: 'g',
          userId: 'u',
          channelId: 'c',
          voiceChannelId: 'c',
          userLimitInput: '',
        }),
      ).rejects.toThrow();
    });
  });

  describe('autoChannelControlLock (POST)', () => {
    it('POST /bot-api/auto-channel/control/lock 로 locked · channelMemberIds · panelMessageId 를 그대로 보낸다', async () => {
      const response = { action: 'updated', code: 'AUTO_CHANNEL_CONTROL_LOCKED', message: 'ok' };
      const { baseURL, captured, close } = await startServer({ body: response });
      closeServer = close;
      const dto = {
        guildId: '111111111111111111',
        userId: '222222222222222222',
        channelId: '333333333333333333',
        voiceChannelId: '333333333333333333',
        locked: true,
        channelMemberIds: ['222222222222222222', '444444444444444444'],
        panelMessageId: '555555555555555555',
      };

      const result = await makeService(baseURL).autoChannelControlLock(dto);

      expect(result).toEqual(response);
      expect(captured[0].method).toBe('POST');
      expect(captured[0].url).toBe('/bot-api/auto-channel/control/lock');
      expect(captured[0].body).toEqual(dto);
    });

    it('해제 요청(locked=false, 빈 멤버 목록)도 그대로 전달한다', async () => {
      const { baseURL, captured, close } = await startServer();
      closeServer = close;

      await makeService(baseURL).autoChannelControlLock({
        guildId: 'g',
        userId: 'u',
        channelId: 'c',
        voiceChannelId: 'c',
        locked: false,
        channelMemberIds: [],
      });

      expect(captured[0].body).toMatchObject({ locked: false, channelMemberIds: [] });
    });

    it('서버 5xx 는 reject 된다(핸들러가 폴백 문구로 editReply)', async () => {
      const { baseURL, close } = await startServer({ status: 503, body: {} });
      closeServer = close;

      await expect(
        makeService(baseURL).autoChannelControlLock({
          guildId: 'g',
          userId: 'u',
          channelId: 'c',
          voiceChannelId: 'c',
          locked: true,
          channelMemberIds: [],
        }),
      ).rejects.toThrow();
    });
  });
});
