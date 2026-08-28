/** 건강도 점수 밴드 임계값 단일 정본 — 웹 게이지·API 폴백 문구·health-diagnosis 프롬프트 루브릭이 공유(F-GEMINI-012 R3) */
export const HEALTH_SCORE_BAND_THRESHOLDS = {
  /** 이 값 이상 = 건강(웹 라벨 "양호", 게이지 초록) */
  HEALTHY: 70,
  /** 이 값 이상 HEALTHY 미만 = 보통(게이지 노랑). 미만은 저조(웹 "주의 필요", 게이지 빨강) */
  MODERATE: 40,
} as const;

/**
 * 건강도 점수를 산출하기 위해 필요한 최소 관측 일수(F-VOICE-040 cold-start 게이팅).
 * 조회 기간 프리셋(days=7|14|30|90)과 **무관하게 고정**이다 — 프리셋마다 게이팅 기준이
 * 달라지면 사용자가 보는 "수집 중" 상태가 탭 전환마다 흔들린다.
 * 관측일수(= 오늘(KST) − trackingSince + 1)가 이 값 **미만**이면 COLLECTING 이다.
 */
export const MIN_HEALTH_SCORE_OBSERVATION_DAYS = 7;
