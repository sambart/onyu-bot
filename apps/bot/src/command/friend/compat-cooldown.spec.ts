/**
 * `/궁합`(`ship`) 채널 쿨다운 단위 테스트 — F-COPRESENCE-036, EC-CP-117, command-policy §3(채널당 10초).
 * 조회(`getCompatCooldownRemainingMs`)와 시작(`startCompatCooldown`)이 분리돼 있어
 * 조회만으로는 쿨다운이 소모되지 않아야 한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getCompatCooldownRemainingMs,
  resetCompatCooldown,
  startCompatCooldown,
} from './compat-cooldown';

const COOLDOWN_MS = 10_000;
const KEY_A = 'guild-1:channel-A';
const KEY_B = 'guild-1:channel-B';
const START_TIME = new Date('2026-11-03T00:00:00.000Z');

describe('compat-cooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START_TIME);
    resetCompatCooldown();
  });

  afterEach(() => {
    resetCompatCooldown();
    vi.useRealTimers();
  });

  it('시작 전에는 남은 시간이 0이다(통과)', () => {
    expect(getCompatCooldownRemainingMs(KEY_A)).toBe(0);
  });

  it('시작 직후 남은 시간은 10000ms 다', () => {
    startCompatCooldown(KEY_A);

    expect(getCompatCooldownRemainingMs(KEY_A)).toBe(COOLDOWN_MS);
  });

  it('시간이 흐르면 남은 시간이 그만큼 줄어든다', () => {
    startCompatCooldown(KEY_A);

    vi.advanceTimersByTime(3_500);

    expect(getCompatCooldownRemainingMs(KEY_A)).toBe(6_500);
  });

  it('9999ms 경과 시점에는 아직 1ms 가 남는다(경계)', () => {
    startCompatCooldown(KEY_A);

    vi.advanceTimersByTime(COOLDOWN_MS - 1);

    expect(getCompatCooldownRemainingMs(KEY_A)).toBe(1);
  });

  it('10초가 경과하면 0 을 반환한다', () => {
    startCompatCooldown(KEY_A);

    vi.advanceTimersByTime(COOLDOWN_MS);

    expect(getCompatCooldownRemainingMs(KEY_A)).toBe(0);
  });

  it('채널 키는 서로 독립이다', () => {
    startCompatCooldown(KEY_A);

    expect(getCompatCooldownRemainingMs(KEY_A)).toBe(COOLDOWN_MS);
    expect(getCompatCooldownRemainingMs(KEY_B)).toBe(0);
  });

  it('같은 channelId 라도 guildId 가 다르면 독립이다', () => {
    startCompatCooldown('guild-1:channel-X');

    expect(getCompatCooldownRemainingMs('guild-2:channel-X')).toBe(0);
  });

  it('조회만으로는 쿨다운이 시작되지 않는다(조회/시작 분리)', () => {
    getCompatCooldownRemainingMs(KEY_A);
    getCompatCooldownRemainingMs(KEY_A);

    expect(getCompatCooldownRemainingMs(KEY_A)).toBe(0);
  });

  it('반복 조회는 쿨다운을 연장하지 않는다', () => {
    startCompatCooldown(KEY_A);

    vi.advanceTimersByTime(4_000);
    getCompatCooldownRemainingMs(KEY_A);
    vi.advanceTimersByTime(6_000);

    expect(getCompatCooldownRemainingMs(KEY_A)).toBe(0);
  });

  it('만료 후 다시 시작하면 새 10초가 부여된다', () => {
    startCompatCooldown(KEY_A);
    vi.advanceTimersByTime(COOLDOWN_MS);
    expect(getCompatCooldownRemainingMs(KEY_A)).toBe(0);

    startCompatCooldown(KEY_A);

    expect(getCompatCooldownRemainingMs(KEY_A)).toBe(COOLDOWN_MS);
  });

  it('명시한 now 인자를 기준으로 만료 시각과 남은 시간을 계산한다', () => {
    const now = START_TIME.getTime();
    startCompatCooldown(KEY_A, now);

    expect(getCompatCooldownRemainingMs(KEY_A, now + 2_000)).toBe(8_000);
    expect(getCompatCooldownRemainingMs(KEY_A, now + COOLDOWN_MS)).toBe(0);
  });

  it('resetCompatCooldown 은 모든 채널의 쿨다운을 초기화한다', () => {
    startCompatCooldown(KEY_A);
    startCompatCooldown(KEY_B);

    resetCompatCooldown();

    expect(getCompatCooldownRemainingMs(KEY_A)).toBe(0);
    expect(getCompatCooldownRemainingMs(KEY_B)).toBe(0);
  });
});
