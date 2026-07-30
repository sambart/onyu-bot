/**
 * `newbie_config` 시스템 기본값 단일 정본. 엔티티 컬럼 default(`newbie-config.orm-entity.ts`)와
 * 리포지토리 `??` 폴백(`newbie-config.repository.ts` applyDtoToEntity/createEntityFromDto 2벌)이
 * 모두 본 상수를 참조한다. 값은 기존 3소스와 동일 — 본 상수 신설은 기본값 변경이 아니다.
 */
export const NEWBIE_CONFIG_DEFAULTS = {
  welcomeEnabled: false,
  missionEnabled: false,
  missionUseMicTime: false,
  missionDisplayMode: 'EMBED',
  mocoEnabled: false,
  mocoNewbieDays: 30,
  mocoAllowNewbieHunter: false,
  mocoDisplayMode: 'EMBED',
  mocoMinCoPresenceMin: 10,
  mocoScorePerSession: 10,
  mocoScorePerMinute: 1,
  mocoScorePerUnique: 5,
  mocoResetPeriod: 'NONE',
  roleEnabled: false,
} as const;

/**
 * 웹 폼 프리필 전용 확장값 — 엔티티 컬럼은 전부 nullable이라 저장 시 값이 없으면 `null`이 들어간다.
 * 즉 시스템 기본값이 아니라 신규 설정 페이지 진입 시 폼에 미리 채워주는 편의값이다.
 */
export const NEWBIE_FORM_DEFAULTS = {
  welcomeEmbedColor: '#5865F2',
  missionEmbedColor: '#57F287',
  mocoEmbedColor: '#5865F2',
  playCountMinDurationMin: 30,
  playCountIntervalMin: 30,
  mocoPlayCountMinDurationMin: 30,
  mocoPlayCountIntervalMin: 30,
} as const;

export type NewbieConfigDefaults = typeof NEWBIE_CONFIG_DEFAULTS;
