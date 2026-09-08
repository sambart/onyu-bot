/**
 * `newbie_mission:refresh` 버튼 채널당 쿨다운(W6, docs/plans/admin-action-guard-fixes.md §7.1).
 * `role-panel-toggle-lock.ts` 의 인메모리 + `setTimeout` 자동 해제 패턴을 준용한다 — 봇에는
 * Redis 가 주입되지 않는다.
 */

/** 쿨다운(ms). command-policy.md §3 "채널당 쿨다운" 가드레일 충족. */
const COOLDOWN_MS = 10_000;

const activeCooldowns = new Set<string>();

/**
 * 쿨다운 통과 시 `true` 를 반환하며 즉시 쿨다운을 건다(check-and-set).
 * 이미 쿨다운 중이면 `false` 를 반환하고 상태를 바꾸지 않는다.
 * @param key `{guildId}:{channelId}` — 채널 단위 스코프(길드 단위로 잠그면 다른 채널 사용자가
 * 영문 모른 채 막힌다).
 */
export function tryConsumeMissionRefresh(key: string): boolean {
  if (activeCooldowns.has(key)) {
    return false;
  }

  activeCooldowns.add(key);
  setTimeout(() => {
    activeCooldowns.delete(key);
  }, COOLDOWN_MS);

  return true;
}

/** 테스트용 초기화. */
export function resetMissionRefreshCooldown(): void {
  activeCooldowns.clear();
}
