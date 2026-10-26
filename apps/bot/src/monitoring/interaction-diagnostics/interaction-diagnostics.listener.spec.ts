import type { Client, Interaction } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INTERACTION_CHECK_AT_MS } from './interaction-diagnostics.constants';
import { InteractionDiagnosticsListener } from './interaction-diagnostics.listener';

const NOW = new Date('2026-10-02T06:30:00Z').getTime();

function makeInteraction(overrides: Record<string, unknown> = {}): Interaction {
  return {
    isAutocomplete: () => false,
    isRepliable: () => true,
    isButton: () => true,
    isCommand: () => false,
    customId: 'auto_btn:123:abc',
    guildId: 'guild-1',
    user: { id: 'user-1' },
    createdTimestamp: NOW,
    replied: false,
    deferred: false,
    ...overrides,
  } as unknown as Interaction;
}

describe('InteractionDiagnosticsListener', () => {
  let listener: InteractionDiagnosticsListener;
  let warn: ReturnType<typeof vi.fn>;
  let log: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    listener = new InteractionDiagnosticsListener({ ws: { ping: 42 } } as unknown as Client);
    warn = vi.fn();
    log = vi.fn();
    // logger 는 private 이라 테스트에서만 타입 우회로 교체한다
    (listener as unknown as { logger: unknown }).logger = { warn, log };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('수신 시 customId prefix 와 지연/ping 을 info 로 남긴다', () => {
    vi.setSystemTime(NOW + 150);
    listener.handle(makeInteraction());

    const line = String(log.mock.calls[0][0]);
    expect(line).toContain('type=button');
    expect(line).toContain('key=auto_btn:');
    expect(line).not.toContain('abc');
    expect(line).toContain('delayMs=150');
    expect(line).toContain('ping=42');
  });

  it('데드라인까지 replied/deferred 가 모두 false 면 warn 한다', () => {
    listener.handle(makeInteraction());
    vi.advanceTimersByTime(INTERACTION_CHECK_AT_MS);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('no response within deadline');
  });

  it('데드라인 전에는 warn 하지 않는다', () => {
    listener.handle(makeInteraction());
    vi.advanceTimersByTime(INTERACTION_CHECK_AT_MS - 1);

    expect(warn).not.toHaveBeenCalled();
  });

  it.each([{ replied: true }, { deferred: true }])('%o 이면 무로그', (state) => {
    const interaction = makeInteraction();
    listener.handle(interaction);
    Object.assign(interaction, state);
    vi.advanceTimersByTime(INTERACTION_CHECK_AT_MS);

    expect(warn).not.toHaveBeenCalled();
  });

  it('수신 지연이 크면 남은 시간만큼만 기다려 판정한다', () => {
    vi.setSystemTime(NOW + 2000);
    listener.handle(makeInteraction());

    vi.advanceTimersByTime(799);
    expect(warn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('delayMs=2000');
  });

  it('이미 데드라인이 지난 수신은 즉시 판정한다', () => {
    vi.setSystemTime(NOW + 5000);
    listener.handle(makeInteraction());
    vi.advanceTimersByTime(0);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('autocomplete 는 로그도 타이머도 없다', () => {
    listener.handle(makeInteraction({ isAutocomplete: () => true }));
    vi.advanceTimersByTime(INTERACTION_CHECK_AT_MS);

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('슬래시 커맨드는 commandName 을 key 로 쓴다', () => {
    listener.handle(
      makeInteraction({
        isButton: () => false,
        isAnySelectMenu: () => false,
        isModalSubmit: () => false,
        isChatInputCommand: () => true,
        isCommand: () => true,
        commandName: 'ping',
      }),
    );

    const line = String(log.mock.calls[0][0]);
    expect(line).toContain('type=slash');
    expect(line).toContain('key=ping');
  });
});
