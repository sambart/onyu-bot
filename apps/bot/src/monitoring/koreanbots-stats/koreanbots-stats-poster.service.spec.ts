import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Mock, Mocked } from 'vitest';

import { KoreanbotsStatsPosterService } from './koreanbots-stats-poster.service';

const TOKEN = 'test-koreanbots-token';
const BOT_ID = '123456789012345678';
const SERVERS = 42;
const SHARDS = 1;
const RATE_LIMITED_STATUS = 429;
const EXPECTED_URL = `https://koreanbots.dev/api/v2/bots/${BOT_ID}/stats`;

function makeConfigServiceMock(token: string | undefined): Mocked<ConfigService> {
  return {
    get: vi.fn().mockReturnValue(token),
  } as unknown as Mocked<ConfigService>;
}

function makeResponse(ok: boolean, status = 200): Response {
  return { ok, status } as Response;
}

describe('KoreanbotsStatsPosterService', () => {
  let fetchMock: Mock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(makeResponse(true));
    global.fetch = fetchMock as unknown as typeof fetch;
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined as never);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined as never);
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('KOREANBOTS_TOKEN 미설정 (no-op)', () => {
    it('토큰이 없으면 isEnabled가 false다', () => {
      const service = new KoreanbotsStatsPosterService(makeConfigServiceMock(undefined));

      expect(service.isEnabled).toBe(false);
    });

    it('토큰이 없으면 postStats() 호출 시 fetch를 호출하지 않는다', async () => {
      const service = new KoreanbotsStatsPosterService(makeConfigServiceMock(undefined));

      await service.postStats(BOT_ID, SERVERS, SHARDS);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('토큰이 빈 문자열이면 postStats() 호출 시 fetch를 호출하지 않는다', async () => {
      const service = new KoreanbotsStatsPosterService(makeConfigServiceMock(''));

      await service.postStats(BOT_ID, SERVERS, SHARDS);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('KOREANBOTS_TOKEN 설정됨', () => {
    it('isEnabled가 true다', () => {
      const service = new KoreanbotsStatsPosterService(makeConfigServiceMock(TOKEN));

      expect(service.isEnabled).toBe(true);
    });

    it('정확한 URL로 POST하며 Authorization 헤더에 Bearer 접두사 없이 토큰 원문을 담는다', async () => {
      const service = new KoreanbotsStatsPosterService(makeConfigServiceMock(TOKEN));

      await service.postStats(BOT_ID, SERVERS, SHARDS);

      expect(fetchMock).toHaveBeenCalledWith(
        EXPECTED_URL,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: TOKEN,
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('body에 servers/shards를 JSON으로 담아 전송한다', async () => {
      const service = new KoreanbotsStatsPosterService(makeConfigServiceMock(TOKEN));

      await service.postStats(BOT_ID, SERVERS, SHARDS);

      const call = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(call[1].body as string)).toEqual({ servers: SERVERS, shards: SHARDS });
    });

    it('응답이 2xx가 아니면 warn 로깅만 하고 예외를 던지지 않는다', async () => {
      fetchMock.mockResolvedValue(makeResponse(false, RATE_LIMITED_STATUS));
      const service = new KoreanbotsStatsPosterService(makeConfigServiceMock(TOKEN));

      await expect(service.postStats(BOT_ID, SERVERS, SHARDS)).resolves.toBeUndefined();
    });

    it('fetch가 reject되어도 예외를 던지지 않고 warn 로깅만 한다', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      const service = new KoreanbotsStatsPosterService(makeConfigServiceMock(TOKEN));

      await expect(service.postStats(BOT_ID, SERVERS, SHARDS)).resolves.toBeUndefined();
    });
  });
});
