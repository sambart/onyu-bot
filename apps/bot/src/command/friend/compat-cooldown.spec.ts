/**
 * `/궁합`(`ship`) 실행자 쿨다운·실행 슬롯 단위 테스트 — F-COPRESENCE-036, D9, command-policy §3.
 * 채널 쿨다운은 2026-11-12 제거했다(실행자 30초만 유지).
 * 조회(`getCompatUserCooldownRemainingMs`)와 시작(`startCompatUserCooldown`)이 분리돼 있어
 * 조회만으로는 쿨다운이 소모되지 않아야 한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as compatCooldown from './compat-cooldown';
import {
  COMPAT_USER_COOLDOWN_MS,
  getCompatUserCooldownRemainingMs,
  releaseCompatSlot,
  resetCompatCooldown,
  startCompatUserCooldown,
  tryAcquireCompatSlot,
} from './compat-cooldown';

const START_TIME = new Date('2026-11-03T00:00:00.000Z');
const USER_A = 'guild-1:user-A';
const USER_B = 'guild-1:user-B';

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

  describe('채널 쿨다운 제거(2026-11-12)', () => {
    it('채널 쿨다운 API(상수·조회·시작)는 더 이상 export 되지 않는다', () => {
      expect(Object.keys(compatCooldown).sort()).toEqual(
        [
          'COMPAT_USER_COOLDOWN_MS',
          'getCompatUserCooldownRemainingMs',
          'releaseCompatSlot',
          'resetCompatCooldown',
          'startCompatUserCooldown',
          'tryAcquireCompatSlot',
        ].sort(),
      );
    });
  });

  describe('실행자 쿨다운(D9)', () => {
    it('상수는 30000ms 다', () => {
      expect(COMPAT_USER_COOLDOWN_MS).toBe(30_000);
    });

    it('시작 전에는 남은 시간이 0이다', () => {
      expect(getCompatUserCooldownRemainingMs(USER_A)).toBe(0);
    });

    it('시작 직후 남은 시간은 30000ms 다', () => {
      startCompatUserCooldown(USER_A);

      expect(getCompatUserCooldownRemainingMs(USER_A)).toBe(30_000);
    });

    it('시간이 흐르면 남은 시간이 줄고 29999ms 경과 시 1ms 가 남는다', () => {
      startCompatUserCooldown(USER_A);

      vi.advanceTimersByTime(12_000);
      expect(getCompatUserCooldownRemainingMs(USER_A)).toBe(18_000);

      vi.advanceTimersByTime(17_999);
      expect(getCompatUserCooldownRemainingMs(USER_A)).toBe(1);
    });

    it('30초가 경과하면 0 을 반환한다', () => {
      startCompatUserCooldown(USER_A);

      vi.advanceTimersByTime(30_000);

      expect(getCompatUserCooldownRemainingMs(USER_A)).toBe(0);
    });

    it('조회만으로는 시작되지 않고 반복 조회가 연장하지도 않는다', () => {
      getCompatUserCooldownRemainingMs(USER_A);
      expect(getCompatUserCooldownRemainingMs(USER_A)).toBe(0);

      startCompatUserCooldown(USER_A);
      vi.advanceTimersByTime(10_000);
      getCompatUserCooldownRemainingMs(USER_A);
      vi.advanceTimersByTime(20_000);

      expect(getCompatUserCooldownRemainingMs(USER_A)).toBe(0);
    });

    it('실행자 키·길드는 서로 독립이다', () => {
      startCompatUserCooldown(USER_A);

      expect(getCompatUserCooldownRemainingMs(USER_B)).toBe(0);
      expect(getCompatUserCooldownRemainingMs('guild-2:user-A')).toBe(0);
    });

    it('명시한 now 인자를 기준으로 계산한다', () => {
      const now = START_TIME.getTime();
      startCompatUserCooldown(USER_A, now);

      expect(getCompatUserCooldownRemainingMs(USER_A, now + 5_000)).toBe(25_000);
      expect(getCompatUserCooldownRemainingMs(USER_A, now + 30_000)).toBe(0);
    });

    it('만료 후 다시 시작하면 새 30초가 부여된다', () => {
      startCompatUserCooldown(USER_A);
      vi.advanceTimersByTime(30_000);
      startCompatUserCooldown(USER_A);

      expect(getCompatUserCooldownRemainingMs(USER_A)).toBe(30_000);
    });

    it('resetCompatCooldown 은 실행자 쿨다운을 모두 비운다', () => {
      startCompatUserCooldown(USER_A);
      startCompatUserCooldown(USER_B);

      resetCompatCooldown();

      expect(getCompatUserCooldownRemainingMs(USER_A)).toBe(0);
      expect(getCompatUserCooldownRemainingMs(USER_B)).toBe(0);
    });
  });

  describe('실행 슬롯', () => {
    it('비어 있는 키는 선점에 성공한다', () => {
      expect(tryAcquireCompatSlot(USER_A)).toBe(true);
    });

    it('이미 선점된 같은 키는 선점에 실패한다', () => {
      tryAcquireCompatSlot(USER_A);

      expect(tryAcquireCompatSlot(USER_A)).toBe(false);
    });

    it('다른 키는 서로 독립이다', () => {
      tryAcquireCompatSlot(USER_A);

      expect(tryAcquireCompatSlot(USER_B)).toBe(true);
    });

    it('반납하면 같은 키를 다시 선점할 수 있다', () => {
      tryAcquireCompatSlot(USER_A);

      releaseCompatSlot(USER_A);

      expect(tryAcquireCompatSlot(USER_A)).toBe(true);
    });

    it('선점하지 않은 키를 반납해도 던지지 않고 다른 키 슬롯에 영향이 없다', () => {
      tryAcquireCompatSlot(USER_A);

      expect(() => releaseCompatSlot(USER_B)).not.toThrow();
      expect(tryAcquireCompatSlot(USER_A)).toBe(false);
    });

    it('resetCompatCooldown 은 선점된 슬롯도 비운다', () => {
      tryAcquireCompatSlot(USER_A);

      resetCompatCooldown();

      expect(tryAcquireCompatSlot(USER_A)).toBe(true);
    });

    it('슬롯 선점은 실행자 쿨다운을 시작하지 않는다', () => {
      tryAcquireCompatSlot(USER_A);

      expect(getCompatUserCooldownRemainingMs(USER_A)).toBe(0);
    });
  });
});
