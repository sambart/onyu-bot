import type { ConfigService } from '@nestjs/config';
import type { Mock, Mocked } from 'vitest';

import { HeartbeatService } from './heartbeat.service';

const PING_KEY = 'test-ping-key';
const SLUG = 'bot-co-presence-tick';
const EXPECTED_URL = `https://hc-ping.com/${PING_KEY}/${SLUG}`;

function makeConfigServiceMock(pingKey: string | undefined): Mocked<ConfigService> {
  return {
    get: vi.fn().mockReturnValue(pingKey),
  } as unknown as Mocked<ConfigService>;
}

describe('HeartbeatService (bot)', () => {
  let fetchMock: Mock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(undefined);
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('ping — HEALTHCHECKS_PING_KEY 미설정 (no-op)', () => {
    it('key가 없으면 fetch를 호출하지 않는다', () => {
      const service = new HeartbeatService(makeConfigServiceMock(undefined));

      service.ping(SLUG);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('key가 빈 문자열이면 fetch를 호출하지 않는다', () => {
      const service = new HeartbeatService(makeConfigServiceMock(''));

      service.ping(SLUG);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('ping — HEALTHCHECKS_PING_KEY 설정됨', () => {
    it('`https://hc-ping.com/<key>/<slug>` URL로 fetch를 정확히 1회 호출한다', async () => {
      const service = new HeartbeatService(makeConfigServiceMock(PING_KEY));

      service.ping(SLUG);
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      expect(fetchMock).toHaveBeenCalledWith(
        EXPECTED_URL,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('fetch가 reject되어도 ping() 호출부는 throw하지 않는다(실패 무해성)', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      const service = new HeartbeatService(makeConfigServiceMock(PING_KEY));

      expect(() => service.ping(SLUG)).not.toThrow();

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
    });
  });
});
