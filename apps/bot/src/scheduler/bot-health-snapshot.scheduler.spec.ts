/**
 * BotHealthSnapshotScheduler 단위 테스트 (F-SUPER-ADMIN-016~018).
 * 대상: getSnapshot() 조립 결과를 그대로 sendHealthSnapshot 에 전달하는지, push 실패 시
 * 예외를 전파하지 않고(fire-and-forget) 경고 로깅만 하는지(bot-co-presence.scheduler.spec.ts
 * 의 실패-전파-없음 관례와 동일 원칙).
 */
import { Logger } from '@nestjs/common';
import type { Mock } from 'vitest';

import type { BotPrometheusService } from '../monitoring/bot-prometheus.service';
import { BotHealthSnapshotScheduler } from './bot-health-snapshot.scheduler';

const SNAPSHOT = { gatewayPing: 30, guildCount: 5, voiceUsersTotal: 12, uptimeSeconds: 3600 };

interface TestContext {
  botPrometheusService: { getSnapshot: Mock };
  apiClient: { sendHealthSnapshot: Mock };
  scheduler: BotHealthSnapshotScheduler;
  warnSpy: ReturnType<typeof vi.spyOn>;
}

function setup(): TestContext {
  const botPrometheusService = { getSnapshot: vi.fn().mockReturnValue(SNAPSHOT) };
  const apiClient = { sendHealthSnapshot: vi.fn().mockResolvedValue(undefined) };
  const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined as never);
  const scheduler = new BotHealthSnapshotScheduler(
    botPrometheusService as unknown as BotPrometheusService,
    apiClient as never,
  );
  return { botPrometheusService, apiClient, scheduler, warnSpy };
}

describe('BotHealthSnapshotScheduler — pushSnapshot 정상 push', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => {
    ctx.warnSpy.mockRestore();
  });

  it('botPrometheusService.getSnapshot() 를 호출해 스냅샷을 조립한다', () => {
    ctx.scheduler.pushSnapshot();

    expect(ctx.botPrometheusService.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it('조립된 스냅샷을 그대로 apiClient.sendHealthSnapshot 에 전달한다', () => {
    ctx.scheduler.pushSnapshot();

    expect(ctx.apiClient.sendHealthSnapshot).toHaveBeenCalledWith(SNAPSHOT);
  });

  it('sendHealthSnapshot 을 정확히 1회 호출한다', () => {
    ctx.scheduler.pushSnapshot();

    expect(ctx.apiClient.sendHealthSnapshot).toHaveBeenCalledTimes(1);
  });
});

describe('BotHealthSnapshotScheduler — pushSnapshot 실패 시 fire-and-forget(E5)', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => {
    ctx.warnSpy.mockRestore();
  });

  it('sendHealthSnapshot 이 reject 되어도 pushSnapshot() 호출 자체는 동기적으로 예외를 던지지 않는다', () => {
    ctx.apiClient.sendHealthSnapshot.mockRejectedValue(new Error('network down'));

    expect(() => ctx.scheduler.pushSnapshot()).not.toThrow();
  });

  it('push 실패는 다음 주기 재시도로 자연 복구되므로 예외 없이 경고만 로깅한다', async () => {
    ctx.apiClient.sendHealthSnapshot.mockRejectedValue(new Error('network down'));

    ctx.scheduler.pushSnapshot();
    // .catch() 핸들러가 실행될 마이크로태스크 flush 대기
    await new Promise((resolve) => setImmediate(resolve));

    expect(ctx.warnSpy).toHaveBeenCalledTimes(1);
    expect(ctx.warnSpy.mock.calls[0]?.[0]).toContain('network down');
  });

  it('push 실패 시에도 봇 프로세스에 영향 없이 다음 pushSnapshot() 호출이 정상 동작한다', async () => {
    ctx.apiClient.sendHealthSnapshot.mockRejectedValueOnce(new Error('temporary failure'));
    ctx.scheduler.pushSnapshot();
    await new Promise((resolve) => setImmediate(resolve));

    ctx.apiClient.sendHealthSnapshot.mockResolvedValueOnce(undefined);
    expect(() => ctx.scheduler.pushSnapshot()).not.toThrow();
    expect(ctx.apiClient.sendHealthSnapshot).toHaveBeenCalledTimes(2);
  });
});
