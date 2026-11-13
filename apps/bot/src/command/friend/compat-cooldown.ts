/**
 * `/궁합`(`ship`) 실행자 쿨다운(F-COPRESENCE-036 D9).
 * 채널당 쿨다운은 2026-11-12 제거했다 — 여러 사용자의 정당한 동시 사용을 서로 막았고,
 * 한 사람의 연타는 실행자 쿨다운이 이미 막는다(command-policy.md §3 예외).
 * 모듈 레벨 인메모리 — provider 로 만들지 않는다(bot-command.module.spec providers 단언 보호).
 * 조회와 시작을 분리한다: 카드가 공개 게시된 뒤에만 시작해 실패·거부는 쿨다운을 소모하지 않는다.
 * 조회~게시 사이 같은 실행자의 동시 실행은 실행 슬롯(`tryAcquireCompatSlot`)으로 1건만 통과시킨다.
 */

/** 카드 생성·게시가 진행 중인 키 — 쿨다운은 게시 후에 시작하므로 그 사이 동시 실행을 여기서 막는다. */
const inFlightKeys = new Set<string>();

/**
 * 실행 슬롯 선점. 같은 키의 다른 실행이 진행 중이면 false.
 * 성공·실패와 무관하게 `releaseCompatSlot` 으로 반드시 반납한다.
 */
export function tryAcquireCompatSlot(key: string): boolean {
  if (inFlightKeys.has(key)) {
    return false;
  }
  inFlightKeys.add(key);
  return true;
}

/** 실행 슬롯 반납. */
export function releaseCompatSlot(key: string): void {
  inFlightKeys.delete(key);
}

/** 실행자 단위 쿨다운(ms) — 한 사람의 연타와 채널을 바꿔 가며 반복 지목하는 것을 막는다(D9 (d) M1). */
export const COMPAT_USER_COOLDOWN_MS = 30_000;

const userCooldownExpiresAt = new Map<string, number>();

/**
 * 실행자 남은 쿨다운(ms). 0 이면 통과. 만료 엔트리는 조회 시 지연 삭제한다.
 * @param key `{guildId}:{userId}`
 */
export function getCompatUserCooldownRemainingMs(key: string, now: number = Date.now()): number {
  const expiresAt = userCooldownExpiresAt.get(key);
  if (expiresAt === undefined) {
    return 0;
  }
  if (expiresAt <= now) {
    userCooldownExpiresAt.delete(key);
    return 0;
  }
  return expiresAt - now;
}

/** 실행자 쿨다운 시작 — 공개 게시 성공 후에만 호출한다. */
export function startCompatUserCooldown(key: string, now: number = Date.now()): void {
  userCooldownExpiresAt.set(key, now + COMPAT_USER_COOLDOWN_MS);
  const timer = setTimeout(() => {
    const expiresAt = userCooldownExpiresAt.get(key);
    if (expiresAt !== undefined && expiresAt <= Date.now()) {
      userCooldownExpiresAt.delete(key);
    }
  }, COMPAT_USER_COOLDOWN_MS);
  // 정리 타이머가 프로세스 종료를 막지 않게 한다.
  timer.unref?.();
}

/** 테스트용 초기화. */
export function resetCompatCooldown(): void {
  userCooldownExpiresAt.clear();
  inFlightKeys.clear();
}
