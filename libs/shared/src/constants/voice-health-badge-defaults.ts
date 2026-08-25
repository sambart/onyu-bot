/**
 * 뱃지 판정 기본 임계값 단일 정본(F-SD-014).
 * config 로우가 없는 길드의 폴백 값이자 웹 설정 폼의 초기값이다.
 * 값은 기존 `voice_health_config` 컬럼 DB 기본값과 동일 — 본 상수 신설은 임계값 변경이 아니다.
 */
export const VOICE_HEALTH_BADGE_DEFAULTS = {
  analysisDays: 30,
  badgeActivityTopPercent: 10,
  badgeSocialHhiMax: 0.25,
  badgeSocialMinPeers: 5,
  badgeHunterTopPercent: 10,
  badgeConsistentMinRatio: 0.8,
  badgeMicMinRate: 0.7,
  // badge-expansion-r1(F-SD-014) 추가분
  badgeStreakMinDays: 7,
  badgeChatterTopPercent: 10,
  // STREAM-STAR-BADGE(F-SD-020) 추가분
  badgeStreamTopPercent: 10,
  badgeStreamMinSec: 3600,
} as const;

export type VoiceHealthBadgeDefaults = typeof VOICE_HEALTH_BADGE_DEFAULTS;
