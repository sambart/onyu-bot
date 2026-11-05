/**
 * `/궁합`(`ship`) 채널당 쿨다운(F-COPRESENCE-036, command-policy.md §3).
 * 모듈 레벨 인메모리 — provider 로 만들지 않는다(bot-command.module.spec providers 단언 보호).
 * 조회와 시작을 분리한다: 카드가 공개 게시된 뒤에만 시작해 실패·거부는 쿨다운을 소모하지 않는다.
 * 조회~게시 사이 동시 실행은 채널 실행 슬롯(`tryAcquireCompatSlot`)으로 1건만 통과시킨다.
 */

/** 채널당 쿨다운(ms). */
export const COMPAT_COOLDOWN_MS = 10_000;

const cooldownExpiresAt = new Map<string, number>();
/** 카드 생성·게시가 진행 중인 채널 — 쿨다운은 게시 후에 시작하므로 그 사이 동시 실행을 여기서 막는다. */
const inFlightKeys = new Set<string>();

/**
 * 남은 쿨다운(ms). 0 이면 통과. 만료 엔트리는 조회 시 지연 삭제한다.
 * @param key `{guildId}:{channelId}`
 */
export function getCompatCooldownRemainingMs(key: string, now: number = Date.now()): number {
  const expiresAt = cooldownExpiresAt.get(key);
  if (expiresAt === undefined) {
    return 0;
  }
  if (expiresAt <= now) {
    cooldownExpiresAt.delete(key);
    return 0;
  }
  return expiresAt - now;
}

/** 쿨다운 시작 — 공개 게시 성공 후에만 호출한다. */
export function startCompatCooldown(key: string, now: number = Date.now()): void {
  cooldownExpiresAt.set(key, now + COMPAT_COOLDOWN_MS);
  const timer = setTimeout(() => {
    const expiresAt = cooldownExpiresAt.get(key);
    if (expiresAt !== undefined && expiresAt <= Date.now()) {
      cooldownExpiresAt.delete(key);
    }
  }, COMPAT_COOLDOWN_MS);
  // 정리 타이머가 프로세스 종료를 막지 않게 한다.
  timer.unref?.();
}

/**
 * 채널 실행 슬롯 선점. 이미 다른 실행이 진행 중이면 false.
 * 성공·실패와 무관하게 `releaseCompatSlot` 으로 반드시 반납한다.
 */
export function tryAcquireCompatSlot(key: string): boolean {
  if (inFlightKeys.has(key)) {
    return false;
  }
  inFlightKeys.add(key);
  return true;
}

/** 채널 실행 슬롯 반납. */
export function releaseCompatSlot(key: string): void {
  inFlightKeys.delete(key);
}

/** 테스트용 초기화. */
export function resetCompatCooldown(): void {
  cooldownExpiresAt.clear();
  inFlightKeys.clear();
}
