/**
 * 봇 read-only 진입점(E8) per-request SDK 타임아웃(F-ADMIN-ASSIST-078~081, M4/A2).
 * `libs/bot-api-client` 전역 타임아웃(10s)은 이 경로의 정상 응답(수십 초 소요)을 조용히
 * 죽인다(쿼터 소모 + 이력 success + 사용자 오류) — 반드시 per-request 로 이 값을 덮어써야
 * 한다. `apps/api`·`libs/bot-api-client` 양쪽이 `@onyu/shared` 에 의존하므로 이 상수 하나로
 * 서버 예산(`ADMIN_ASSIST_SERVER_TOTAL_BUDGET_MS`, apps/api 소유)과의 부등식 회귀를
 * 한 파일에서 비교할 수 있다(endpoint-spec §5E-9).
 */
export const ADMIN_ASSIST_RECOMMEND_TIMEOUT_MS = 50_000;

/**
 * Phase 3 승인-실행(F-ADMIN-ASSIST-099, I-3) — E9 로 실행 가능한 등급 ① 액션의 코드 단일 소스.
 * 카탈로그 executionGrade ↔ 스펙/어댑터 레지스트리가 이 목록과 일치해야 한다.
 */
export const ADMIN_ASSIST_EXECUTABLE_ACTION_IDS = [
  'inactive-member.criteria',
  'level.enable',
  'voice-health.badge',
] as const;

export type AdminAssistExecutableActionId = (typeof ADMIN_ASSIST_EXECUTABLE_ACTION_IDS)[number];

export function isAdminAssistExecutableActionId(id: string): id is AdminAssistExecutableActionId {
  return (ADMIN_ASSIST_EXECUTABLE_ACTION_IDS as readonly string[]).includes(id);
}

/** proposal 만료 TTL 기본값(분) — env ADMIN_ASSIST_EXECUTE_TTL_MIN 기본과 동일 (D-8) */
export const ADMIN_ASSIST_EXECUTE_TTL_MIN_DEFAULT = 30;
/** TTL env 허용 범위(분) */
export const ADMIN_ASSIST_EXECUTE_TTL_MIN_MIN = 5;
export const ADMIN_ASSIST_EXECUTE_TTL_MIN_MAX = 120;
/** executing claim 회수 임계(ms) — Discord REST_TIMEOUT_MS(30s) < STALE 불변식 (D-7·D-30) */
export const ADMIN_ASSIST_EXECUTE_STALE_CLAIM_MS = 120_000;
/** E1 proposal 발급 예산(ms) — 진단과 병렬, 초과 시 link_only/read_failed (D-26) */
export const ADMIN_ASSIST_PROPOSAL_BUDGET_MS = 2_000;
/** previewDigest 형식: sha256 소문자 hex 64자 */
export const ADMIN_ASSIST_PREVIEW_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
/** E9 path historyId 형식 — 선행 0·0 거절 (D-18) */
export const ADMIN_ASSIST_HISTORY_ID_PATTERN = /^[1-9]\d{0,18}$/;
/** E9 200 `warnings` 값 (D-25·D-29) */
export const ADMIN_ASSIST_EXECUTE_WARNING_POST_SAVE_STEP_FAILED = 'POST_SAVE_STEP_FAILED';
