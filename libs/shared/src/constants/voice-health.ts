/**
 * 음성 활동 자가진단(self-diagnosis) verdict 카테고리 — API/봇 공용 계약.
 * 정본은 API 생성값(공백 포함 표기 포함). 봇은 반드시 이 상수를 참조해야 하며
 * 리터럴 문자열을 하드코딩하지 않는다 (재발 방지 — Gemini 개편 Phase 1 B2).
 */
export const VOICE_HEALTH_VERDICT_CATEGORY = {
  ACTIVITY: '활동량',
  ACTIVE_DAYS: '활동 일수',
  RELATIONSHIP_DIVERSITY: '관계 다양성',
  PEER_COUNT: '교류 인원',
} as const;

export type VerdictCategory =
  (typeof VOICE_HEALTH_VERDICT_CATEGORY)[keyof typeof VOICE_HEALTH_VERDICT_CATEGORY];

/** verdict 카테고리 판별 코드 (H-4.3) — 봇 런타임 비교를 한국어 값 → 이 코드로 이관.
 *  VOICE_HEALTH_VERDICT_CATEGORY 와 키 동일, 값은 로케일 무관 식별자. */
export const VERDICT_CATEGORY_CODE = {
  ACTIVITY: 'ACTIVITY',
  ACTIVE_DAYS: 'ACTIVE_DAYS',
  RELATIONSHIP_DIVERSITY: 'RELATIONSHIP_DIVERSITY',
  PEER_COUNT: 'PEER_COUNT',
} as const;
export type VerdictCategoryCode =
  (typeof VERDICT_CATEGORY_CODE)[keyof typeof VERDICT_CATEGORY_CODE];
