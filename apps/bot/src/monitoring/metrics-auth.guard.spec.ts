import type { IncomingMessage } from 'node:http';

import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Mocked } from 'vitest';

import { MetricsAuthGuard } from './metrics-auth.guard';

function makeContext(headers: Partial<IncomingMessage['headers']>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }) as IncomingMessage,
    }),
  } as unknown as ExecutionContext;
}

function makeGuard(metricsAuthToken: string): MetricsAuthGuard {
  const configService = {
    get: vi.fn().mockReturnValue(metricsAuthToken),
  } as unknown as Mocked<ConfigService>;

  return new MetricsAuthGuard(configService);
}

describe('MetricsAuthGuard', () => {
  describe('canActivate', () => {
    it('METRICS_AUTH_TOKEN이 설정되지 않으면(빈 문자열) UnauthorizedException을 throw한다', () => {
      const guard = makeGuard('');
      const ctx = makeContext({ authorization: 'Bearer sometoken' });

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow('METRICS_AUTH_TOKEN is not configured');
    });

    it('authorization 헤더가 없으면 UnauthorizedException을 throw한다', () => {
      const guard = makeGuard('secret-token');
      const ctx = makeContext({});

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow('Missing or invalid authorization header');
    });

    it('authorization 헤더가 Bearer 접두사로 시작하지 않으면 UnauthorizedException을 throw한다', () => {
      const guard = makeGuard('secret-token');
      const ctx = makeContext({ authorization: 'Basic c2VjcmV0LXRva2Vu' });

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow('Missing or invalid authorization header');
    });

    it('올바른 토큰을 Bearer 토큰으로 전달하면 true를 반환한다', () => {
      const token = 'correct-metrics-token';
      const guard = makeGuard(token);
      const ctx = makeContext({ authorization: `Bearer ${token}` });

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('같은 길이지만 틀린 토큰을 전달하면 UnauthorizedException을 throw한다', () => {
      const guard = makeGuard('correct-token-12'); // length 16
      const ctx = makeContext({ authorization: 'Bearer wrong-token-12' }); // length 16

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow('Invalid metrics token');
    });

    it('다른 길이의 틀린 토큰을 전달해도 timingSafeEqual throw 없이 UnauthorizedException을 throw한다', () => {
      // 회귀 핵심: 길이 선검사가 없으면 timingSafeEqual이 RangeError를 throw함
      const guard = makeGuard('short');
      const ctx = makeContext({ authorization: 'Bearer this-is-a-much-longer-wrong-token' });

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow('Invalid metrics token');
    });

    it("'Bearer ' 뒤 빈 문자열(토큰 없음)이고 토큰은 비어있지 않으면 UnauthorizedException을 throw한다", () => {
      const guard = makeGuard('some-token');
      const ctx = makeContext({ authorization: 'Bearer ' });

      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(ctx)).toThrow('Invalid metrics token');
    });
  });
});
