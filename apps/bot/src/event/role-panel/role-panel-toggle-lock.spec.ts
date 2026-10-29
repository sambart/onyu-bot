/**
 * role-panel-toggle-lock 단위 테스트
 *
 * 커버 케이스:
 * - acquireLock: 최초 획득 → 토큰, 동일 키 재획득 → null (LOCKED 시맨틱), 다른 키 독립
 * - releaseLock: 해제 후 재획득 가능 / 존재하지 않는 키·중복 해제 → 오류 없음
 * - TTL 안전망: 3초 후 자동 해제 (fake timer)
 * - 토큰 비교(A8-4): 만료 후 남이 재획득한 락을 옛 소유자의 해제·옛 타이머가 지우지 않는다
 */

import { acquireLock, releaseLock } from './role-panel-toggle-lock';

const TTL_MS = 3000;

describe('role-panel-toggle-lock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('acquireLock', () => {
    it('최초 획득 → 토큰 반환', () => {
      const key = 'lock-1';
      const token = acquireLock(key);

      expect(token).not.toBeNull();

      if (token) releaseLock(key, token);
    });

    it('이미 획득된 키 재획득 → null 반환 (SET-NX 시맨틱)', () => {
      const key = 'lock-2';
      const token = acquireLock(key);

      expect(acquireLock(key)).toBeNull();

      if (token) releaseLock(key, token);
    });

    it('서로 다른 키는 독립적으로 획득 가능', () => {
      const tokenA = acquireLock('lock-3a');
      const tokenB = acquireLock('lock-3b');

      expect(tokenB).not.toBeNull();

      if (tokenA) releaseLock('lock-3a', tokenA);
      if (tokenB) releaseLock('lock-3b', tokenB);
    });

    it('해제 후 동일 키 재획득 → 토큰 반환', () => {
      const key = 'lock-4';
      const token = acquireLock(key);
      if (token) releaseLock(key, token);

      const again = acquireLock(key);

      expect(again).not.toBeNull();

      if (again) releaseLock(key, again);
    });
  });

  describe('releaseLock', () => {
    it('존재하지 않는 키 해제 시 오류 없음', () => {
      expect(() => releaseLock('nonexistent-key', Symbol('x'))).not.toThrow();
    });

    it('이미 해제된 키 중복 해제 → 오류 없음', () => {
      const key = 'lock-6';
      const token = acquireLock(key);
      if (!token) throw new Error('락 획득 실패');
      releaseLock(key, token);

      expect(() => releaseLock(key, token)).not.toThrow();
    });
  });

  describe('TTL 안전망 (3초 자동 해제)', () => {
    it('3000ms 후 TTL 안전망 — 락이 자동 해제됨', () => {
      const key = 'lock-ttl';
      acquireLock(key);

      vi.advanceTimersByTime(TTL_MS - 1);
      expect(acquireLock(key)).toBeNull();

      vi.advanceTimersByTime(1);
      const again = acquireLock(key);
      expect(again).not.toBeNull();

      if (again) releaseLock(key, again);
    });
  });

  describe('A8-4: 락 토큰 비교 해제', () => {
    it('만료 후 남이 재획득한 락을 옛 소유자가 해제해도 새 락은 유지된다', () => {
      const key = 'lock-stale-release';
      const staleToken = acquireLock(key);
      if (!staleToken) throw new Error('락 획득 실패');

      // 처리가 TTL 보다 길어져 락이 만료되고 다른 요청이 재획득
      vi.advanceTimersByTime(TTL_MS);
      const newToken = acquireLock(key);
      expect(newToken).not.toBeNull();

      // 옛 소유자의 finally 해제 — 남의 락을 지우면 안 된다
      releaseLock(key, staleToken);

      expect(acquireLock(key)).toBeNull();

      if (newToken) releaseLock(key, newToken);
    });

    it('옛 락의 TTL 타이머가 새로 획득한 락을 지우지 않는다', () => {
      const key = 'lock-stale-timer';
      const first = acquireLock(key);
      if (!first) throw new Error('락 획득 실패');

      // 1s 경과 후 정상 해제 → 새 락 획득(옛 타이머가 아직 살아있던 시점)
      vi.advanceTimersByTime(1000);
      releaseLock(key, first);
      const second = acquireLock(key);
      expect(second).not.toBeNull();

      // 옛 타이머 만료 시점(원래 락 획득 + 3s) — 새 락은 아직 2s 남아 있어야 한다
      vi.advanceTimersByTime(TTL_MS - 1000);
      expect(acquireLock(key)).toBeNull();

      if (second) releaseLock(key, second);
    });
  });

  describe('EC-RP-16: TOGGLE 동시 클릭 시나리오', () => {
    it('사용자A의 동시 TOGGLE 클릭: 첫 번째만 통과, 두 번째 차단', () => {
      const lockKey = 'guild-1:user-1:buttonId-10';

      const first = acquireLock(lockKey);
      const second = acquireLock(lockKey);

      expect(first).not.toBeNull();
      expect(second).toBeNull();

      if (first) releaseLock(lockKey, first);
    });

    it('다른 사용자·다른 버튼의 TOGGLE은 서로 차단하지 않음', () => {
      const user1 = acquireLock('guild-1:user-1:buttonId-10');
      const user2 = acquireLock('guild-1:user-2:buttonId-10');
      const btn11 = acquireLock('guild-1:user-1:buttonId-11');

      expect(user2).not.toBeNull();
      expect(btn11).not.toBeNull();

      if (user1) releaseLock('guild-1:user-1:buttonId-10', user1);
      if (user2) releaseLock('guild-1:user-2:buttonId-10', user2);
      if (btn11) releaseLock('guild-1:user-1:buttonId-11', btn11);
    });
  });
});
