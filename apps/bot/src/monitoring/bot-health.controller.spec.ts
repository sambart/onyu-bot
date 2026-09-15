import { ServiceUnavailableException } from '@nestjs/common';
import type { Client } from 'discord.js';
import type { Mock } from 'vitest';

import { BotHealthController } from './bot-health.controller';

interface FakeClient {
  isReady: Mock;
  ws: { ping: number };
}

function makeClient(isReady: boolean, ping: number): FakeClient {
  return {
    isReady: vi.fn().mockReturnValue(isReady),
    ws: { ping },
  };
}

/** FakeClient을 BotHealthController 생성자가 요구하는 Client로 좁힌다(테스트 전용 최소 목). */
function asClient(fake: FakeClient): Client {
  return fake as unknown as Client;
}

describe('BotHealthController', () => {
  describe('check (GET /health)', () => {
    it('Discord Client가 준비되면 200 상당 응답을 반환한다', () => {
      const client = makeClient(true, 42);
      const controller = new BotHealthController(asClient(client));

      expect(controller.check()).toEqual({
        status: 'ok',
        discord: { ready: true, ping: 42 },
      });
    });

    it('discord.js ws.ping이 음수(-1, 미연결 초기값)여도 0으로 클램프한다', () => {
      const client = makeClient(true, -1);
      const controller = new BotHealthController(asClient(client));

      expect(controller.check()).toEqual({
        status: 'ok',
        discord: { ready: true, ping: 0 },
      });
    });

    it('Discord Client가 준비되지 않으면 ServiceUnavailableException(503)을 throw한다', () => {
      const client = makeClient(false, -1);
      const controller = new BotHealthController(asClient(client));

      expect(() => controller.check()).toThrow(ServiceUnavailableException);
    });

    it('Discord Client 미준비 시 예외 응답 본문에 ready:false가 실린다', () => {
      const client = makeClient(false, -1);
      const controller = new BotHealthController(asClient(client));

      try {
        controller.check();
        expect.unreachable('ServiceUnavailableException이 throw돼야 한다');
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as ServiceUnavailableException).getResponse()).toEqual({
          status: 'error',
          discord: { ready: false },
        });
      }
    });

    it('Discord Client 미준비 시 예외의 HTTP 상태 코드는 503이다', () => {
      const client = makeClient(false, -1);
      const controller = new BotHealthController(asClient(client));

      try {
        controller.check();
        expect.unreachable('ServiceUnavailableException이 throw돼야 한다');
      } catch (error) {
        expect((error as ServiceUnavailableException).getStatus()).toBe(503);
      }
    });

    it('ws.ping이 0이면 클램프 없이 그대로 0을 반환한다', () => {
      const client = makeClient(true, 0);
      const controller = new BotHealthController(asClient(client));

      expect(controller.check()).toEqual({
        status: 'ok',
        discord: { ready: true, ping: 0 },
      });
    });

    it('ws.ping이 양수(예: 87)이면 클램프 없이 값 그대로 반환한다', () => {
      const client = makeClient(true, 87);
      const controller = new BotHealthController(asClient(client));

      expect(controller.check()).toEqual({
        status: 'ok',
        discord: { ready: true, ping: 87 },
      });
    });

    it('isReady()가 true에서 false로 바뀌면 다음 호출에서 상태를 캐시하지 않고 503을 반환한다', () => {
      const client = makeClient(true, 42);
      const controller = new BotHealthController(asClient(client));

      expect(controller.check()).toEqual({
        status: 'ok',
        discord: { ready: true, ping: 42 },
      });

      client.isReady.mockReturnValue(false);

      expect(() => controller.check()).toThrow(ServiceUnavailableException);
    });

    it('isReady()가 false에서 true로 바뀌면 다음 호출에서 상태를 캐시하지 않고 200 상당 응답을 반환한다', () => {
      const client = makeClient(false, -1);
      const controller = new BotHealthController(asClient(client));

      expect(() => controller.check()).toThrow(ServiceUnavailableException);

      client.isReady.mockReturnValue(true);
      client.ws.ping = 10;

      expect(controller.check()).toEqual({
        status: 'ok',
        discord: { ready: true, ping: 10 },
      });
    });
  });

  describe('liveness (GET /health/liveness)', () => {
    it("Discord 상태와 무관하게 { status: 'ok' }를 반환한다", () => {
      const client = makeClient(false, -1);
      const controller = new BotHealthController(asClient(client));

      expect(controller.liveness()).toEqual({ status: 'ok' });
    });
  });
});
