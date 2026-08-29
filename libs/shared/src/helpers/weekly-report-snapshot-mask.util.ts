import type { WeeklyReportSnapshot } from '../types/super-admin';

/** F-GEMINI-029 sentinel — 값 변경 금지(과거 마스킹 행과 불일치 시 멱등 가드가 깨진다) */
export const WEEKLY_REPORT_SNAPSHOT_MASKED_USERNAME = '(deleted user)';

export interface WeeklyReportSnapshotMaskResult {
  snapshot: WeeklyReportSnapshot;
  isMasked: boolean;
}

type WeeklyReportSnapshotTopUser = WeeklyReportSnapshot['topUsers'][number];
type WeeklyReportSnapshotTopPair = WeeklyReportSnapshot['topPairs'][number];

/** `topUsers[]` 중 `userId` 가 일치하는 원소만 부분 마스킹한다(원본 mutate 없음). */
function maskTopUsers(
  topUsers: WeeklyReportSnapshotTopUser[],
  userId: string,
): { topUsers: WeeklyReportSnapshotTopUser[]; isMasked: boolean } {
  let isMasked = false;
  const nextTopUsers = topUsers.map((u) => {
    if (u.userId !== userId) return u;
    isMasked = true;
    return { ...u, userId: null, username: WEEKLY_REPORT_SNAPSHOT_MASKED_USERNAME };
  });
  return { topUsers: isMasked ? nextTopUsers : topUsers, isMasked };
}

/** `topPairs[]` 의 A측/B측을 독립적으로 판정해 부분 마스킹한다(양측 동시 일치 시 둘 다 마스킹). */
function maskTopPairs(
  topPairs: WeeklyReportSnapshotTopPair[],
  userId: string,
): { topPairs: WeeklyReportSnapshotTopPair[]; isMasked: boolean } {
  let isMasked = false;
  const nextTopPairs = topPairs.map((p) => {
    let next = p;
    if (p.userAId === userId) {
      next = { ...next, userAId: null, userAName: WEEKLY_REPORT_SNAPSHOT_MASKED_USERNAME };
      isMasked = true;
    }
    if (p.userBId === userId) {
      next = { ...next, userBId: null, userBName: WEEKLY_REPORT_SNAPSHOT_MASKED_USERNAME };
      isMasked = true;
    }
    return next;
  });
  return { topPairs: isMasked ? nextTopPairs : topPairs, isMasked };
}

/**
 * GDPR 삭제(F-GEMINI-029) — `weekly_report_history.snapshot` 안에서 요청자가 등장하는 항목만
 * 부분 마스킹한다. 행 삭제가 아니다(행은 길드×주 단위라 타 유저 데이터가 공존한다).
 *
 * - ID → `null`(완전 소거), 표시명 → {@link WEEKLY_REPORT_SNAPSHOT_MASKED_USERNAME}.
 * - `minutes`/`sessionCount`/`meetDays`/`voiceTime`, `topChannels`/`currentStats`/`prevStats`/
 *   `healthScore` 는 전부 무변경 — 특히 `healthScore` 는 optional 키이므로 부재 시 새로 만들지
 *   않는다(스프레드로 나머지 키를 원형 유지 — `findRecentHealthScores()` 필터 오염 방지).
 * - 입력 `snapshot` 객체·중첩 배열·원소는 절대 mutate 하지 않는다.
 * - 변경이 하나도 없으면 `{ snapshot, isMasked: false }` 로 원본 참조 그대로 반환한다
 *   (호출측이 UPDATE 를 건너뛴다 — 멱등성의 근간).
 */
export function maskUserInWeeklyReportSnapshot(
  snapshot: WeeklyReportSnapshot,
  userId: string,
): WeeklyReportSnapshotMaskResult {
  const { topUsers, isMasked: isTopUsersMasked } = maskTopUsers(snapshot.topUsers, userId);
  const { topPairs, isMasked: isTopPairsMasked } = maskTopPairs(snapshot.topPairs, userId);

  if (!isTopUsersMasked && !isTopPairsMasked) {
    return { snapshot, isMasked: false };
  }

  return {
    snapshot: { ...snapshot, topUsers, topPairs },
    isMasked: true,
  };
}
