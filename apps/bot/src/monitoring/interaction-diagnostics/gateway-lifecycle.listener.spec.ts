import type { Client } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GatewayLifecycleListener } from './gateway-lifecycle.listener';
import { PING_WARN_THRESHOLD_MS } from './interaction-diagnostics.constants';

describe('GatewayLifecycleListener', () => {
  let listener: GatewayLifecycleListener;
  let ws: { ping: number };
  let logger: {
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    ws = { ping: 50 };
    listener = new GatewayLifecycleListener({ ws } as unknown as Client);
    logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    // logger 는 private 이라 테스트에서만 타입 우회로 교체한다
    (listener as unknown as { logger: unknown }).logger = logger;
  });

  it('shardDisconnect 는 close code 와 함께 warn', () => {
    listener.onShardDisconnect({ code: 4000 }, 0);
    expect(String(logger.warn.mock.calls[0][0])).toContain('code=4000');
  });

  it('shardReconnecting 은 warn', () => {
    listener.onShardReconnecting(0);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('shardResume 은 replayed 수와 함께 warn', () => {
    listener.onShardResume(0, 7);
    expect(String(logger.warn.mock.calls[0][0])).toContain('replayed=7');
  });

  it('shardError / invalidated / client error 는 error', () => {
    listener.onShardError(new Error('x'), 0);
    listener.onInvalidated();
    listener.onClientError(new Error('y'));
    expect(logger.error).toHaveBeenCalledTimes(3);
  });

  it('shardReady 는 info, client warn 은 warn', () => {
    listener.onShardReady(0);
    listener.onClientWarn('careful');
    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('ping 이 임계 이하면 무로그', () => {
    ws.ping = PING_WARN_THRESHOLD_MS;
    listener.checkPing();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('ping 이 임계를 넘으면 warn', () => {
    ws.ping = PING_WARN_THRESHOLD_MS + 1;
    listener.checkPing();
    expect(String(logger.warn.mock.calls[0][0])).toContain('high ws ping');
  });
});
