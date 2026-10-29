/**
 * TOGGLE 버튼 동시 클릭 방지를 위한 인메모리 락 유틸.
 *
 * 봇은 Redis 미주입이므로(UC-05 분산 락 대신) 봇 프로세스 내 SET-NX 시맨틱으로 구현한다.
 * 단일 프로세스(샤딩 없음) 전제 — 다중 인스턴스 운영 시 분산 락 도입 필요.
 *
 * TTL 안전망(3s): 비정상 흐름에서 finally 락 해제가 누락되더라도 3초 후 자동 해제된다.
 * 정상 경로는 finally 블록에서 즉시 해제한다.
 *
 * 락 토큰: 획득마다 고유 토큰을 발급하고, 해제(수동·TTL 모두)는 토큰이 일치할 때만 수행한다.
 * 처리가 TTL(3s)보다 길어져 락이 만료되고 다른 요청이 같은 키를 재획득한 뒤에, 먼저 시작한 요청이
 * finally 에서 남의 락을 지우거나 옛 타이머가 새 락을 지우는 경합을 막는다.
 *
 * EXCLUSIVE 모드(F-ROLE-PANEL-009)는 그룹 단위 키(`{guildId}:{userId}:{groupKey}`)를 써서
 * 같은 배타 그룹의 다른 버튼 간 동시 클릭 경합까지 막는다. TOGGLE은 버튼 단위 키를 유지한다.
 */

/** 락 TTL 안전망 (밀리초) — UC-05 3s 기준과 동일 */
const LOCK_TTL_MS = 3_000;

interface LockEntry {
  token: symbol;
  timer: ReturnType<typeof setTimeout>;
}

/** 락 소유권 증명 토큰 — {@link releaseLock} 에 그대로 전달한다 */
export type LockToken = symbol;

const activeLocks = new Map<string, LockEntry>();

/**
 * 락 키를 획득한다 (SET-NX 시맨틱).
 * @returns 획득 성공 시 소유권 토큰, 이미 점유 중이면 null
 */
export function acquireLock(key: string): LockToken | null {
  if (activeLocks.has(key)) {
    return null;
  }

  const token = Symbol(key);

  // TTL 안전망: finally 해제 누락 시 3초 후 자동 해제 — 자기 토큰의 락일 때만 지운다
  const timer = setTimeout(() => {
    if (activeLocks.get(key)?.token === token) {
      activeLocks.delete(key);
    }
  }, LOCK_TTL_MS);

  activeLocks.set(key, { token, timer });
  return token;
}

/**
 * 락 키를 해제한다. 토큰이 현재 락의 소유 토큰과 다르면(이미 만료되어 남이 재획득) 무시한다.
 * 존재하지 않는 키 해제 시에도 무시한다.
 */
export function releaseLock(key: string, token: LockToken): void {
  const entry = activeLocks.get(key);
  if (entry?.token !== token) {
    return;
  }
  clearTimeout(entry.timer);
  activeLocks.delete(key);
}
