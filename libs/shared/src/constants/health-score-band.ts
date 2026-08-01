/** 건강도 점수 밴드 임계값 단일 정본 — 웹 게이지·API 폴백 문구·health-diagnosis 프롬프트 루브릭이 공유(F-GEMINI-012 R3) */
export const HEALTH_SCORE_BAND_THRESHOLDS = {
  /** 이 값 이상 = 건강(웹 라벨 "양호", 게이지 초록) */
  HEALTHY: 70,
  /** 이 값 이상 HEALTHY 미만 = 보통(게이지 노랑). 미만은 저조(웹 "주의 필요", 게이지 빨강) */
  MODERATE: 40,
} as const;
