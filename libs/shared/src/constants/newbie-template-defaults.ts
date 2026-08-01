/**
 * 신입사용자(newbie) 미션/모코코 임베드 템플릿 기본값 + 허용 변수 단일 정본.
 * 원본은 `apps/api/src/newbie/infrastructure/newbie-template.constants.ts` (108줄) —
 * 값은 그대로 옮긴 것이며 신설은 값 변경이 아니다. api 원본 파일은 재수출(re-export) shim 으로
 * 전환될 예정이라(S2a) 기존 import 경로는 그대로 유지된다.
 *
 * 허용변수(`*_ALLOWED_VARS`)를 기본 템플릿 문자열과 함께 이 파일에 두는 이유(DR-1/DR-2 재발 방지):
 * 기본 템플릿이 자신의 허용변수 목록을 모른 채 다른 계층에 따로 존재하면, 허용변수가 바뀌어도
 * 기본 템플릿이 갱신되지 않는 드리프트가 재발한다. 두 값을 한 파일에 두면 "기본 템플릿은
 * 자기 허용변수만 사용한다" 라는 드리프트 가드 테스트를 이 파일 하나로 작성할 수 있다.
 */

// ---- 미션 템플릿 기본값 ----

export const DEFAULT_MISSION_TITLE_TEMPLATE = '🧑‍🌾 신입 미션 체크';

export const DEFAULT_MISSION_HEADER_TEMPLATE = '🧑‍🌾 뉴비 멤버 (총 인원: {totalCount}명)';

export const DEFAULT_MISSION_ITEM_TEMPLATE =
  '{mention} 🌱\n{startDate} ~ {endDate}\n{statusEmoji} {statusText} | 플레이타임: {playtime} | 플레이횟수: {playCount}회';

export const DEFAULT_MISSION_FOOTER_TEMPLATE = '마지막 갱신: {updatedAt}';

/**
 * 신입 미션 상태 표시 매핑 항목 셰이프 — `apps/api/src/newbie/domain/newbie-mission.types.ts` 의
 * `StatusMappingEntry` 와 구조적으로 동일하다. `libs/shared` 는 api 도메인 타입에 의존하지 않으므로
 * (P3) import 하지 않고 여기서 독립적으로 정의한다.
 */
interface NewbieStatusMappingEntry {
  emoji: string;
  text: string;
}

/** `apps/api/src/newbie/domain/newbie-mission.types.ts` 의 `StatusMapping` 과 구조적으로 동일. */
interface NewbieStatusMapping {
  IN_PROGRESS: NewbieStatusMappingEntry;
  COMPLETED: NewbieStatusMappingEntry;
  FAILED: NewbieStatusMappingEntry;
  LEFT: NewbieStatusMappingEntry;
}

export const DEFAULT_STATUS_MAPPING: NewbieStatusMapping = {
  IN_PROGRESS: { emoji: '🟡', text: '진행중' },
  COMPLETED: { emoji: '✅', text: '완료' },
  FAILED: { emoji: '❌', text: '실패' },
  LEFT: { emoji: '🚪', text: '퇴장' },
};

// ---- 미션 템플릿 허용 변수 ----

export const MISSION_TITLE_ALLOWED_VARS = ['{totalCount}'] as const;

export const MISSION_HEADER_ALLOWED_VARS = [
  '{totalCount}',
  '{inProgressCount}',
  '{completedCount}',
  '{failedCount}',
  '{leftCount}',
] as const;

export const MISSION_ITEM_ALLOWED_VARS = [
  '{username}',
  '{mention}',
  '{startDate}',
  '{endDate}',
  '{statusEmoji}',
  '{statusText}',
  '{playtimeHour}',
  '{playtimeMin}',
  '{playtimeSec}',
  '{playtime}',
  '{playCount}',
  '{targetPlaytime}',
  '{targetPlayCount}',
  '{daysLeft}',
] as const;

export const MISSION_FOOTER_ALLOWED_VARS = ['{updatedAt}'] as const;

// ---- 모코코 템플릿 기본값 ----

// A6: Embed 모드 10명/페이지 — titleTemplate은 페이지 단위(1회), bodyTemplate은 사냥꾼 1명당 반복.
export const DEFAULT_MOCO_TITLE_TEMPLATE = '🏆 모코코 사냥 순위';

export const DEFAULT_MOCO_BODY_TEMPLATE =
  '**TOP {rank} — {hunterName} 🌱**\n**🏆 {score}점**\n⏱️ {totalMinutes}분 · 🎮 {sessionCount}회 · 🌱 {uniqueNewbieCount}명\n\n{mocoList}';

export const DEFAULT_MOCO_ITEM_TEMPLATE = '🌱 **{newbieName}** — {minutes}분 ({sessions}회)';

export const DEFAULT_MOCO_FOOTER_TEMPLATE =
  '페이지 {currentPage}/{totalPages} | 자동 갱신 {interval}분';

export const DEFAULT_MOCO_FOOTER_TEMPLATE_NO_INTERVAL = '페이지 {currentPage}/{totalPages}';

// ---- 모코코 템플릿 허용 변수 ----

// titleTemplate은 페이지 단위 1회 렌더 — {rank}/{hunterName}은 더 이상 title에서 사용 불가(bodyTemplate로 이동, A6)
export const MOCO_TITLE_ALLOWED_VARS = ['{currentPage}', '{totalPages}'] as const;

// bodyTemplate은 사냥꾼 1명당 반복 렌더 — {rank}/{hunterName} 신규 편입(A6)
export const MOCO_BODY_ALLOWED_VARS = [
  '{rank}',
  '{hunterName}',
  '{totalMinutes}',
  '{mocoList}',
  '{score}',
  '{sessionCount}',
  '{uniqueNewbieCount}',
] as const;

export const MOCO_ITEM_ALLOWED_VARS = [
  '{newbieName}',
  '{newbieMention}',
  '{minutes}',
  '{sessions}',
] as const;

export const MOCO_FOOTER_ALLOWED_VARS = [
  '{currentPage}',
  '{totalPages}',
  '{interval}',
  '{periodStart}',
  '{periodEnd}',
] as const;

// ---- 모코코 점수 산정 템플릿 ----

export const DEFAULT_MOCO_SCORING_TEMPLATE =
  '── 점수 산정 ──\n🎮 {scorePerSession}점/회 · ⏱️ {scorePerMinute}점/분 · 🌱 {scorePerUnique}점/명\n⏳ 최소 {minCoPresence}분 동시접속';

export const MOCO_SCORING_ALLOWED_VARS = [
  '{scorePerSession}',
  '{scorePerMinute}',
  '{scorePerUnique}',
  '{minCoPresence}',
] as const;
