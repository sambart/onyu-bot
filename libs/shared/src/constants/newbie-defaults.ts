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

/**
 * OB-2: `mocoResetIntervalDays` 저장값 자체는 null이지만, CUSTOM 리셋 주기 선택 시 입력 UI에
 * 표시할 제안값(placeholder). `NEWBIE_FORM_DEFAULTS`에 넣지 않는 이유 — FORM_DEFAULTS는
 * `NewbieConfig` 필드로 그대로 스프레드되는데 이 값은 필드 프리필이 아니라 표시 전용이다.
 */
export const NEWBIE_MOCO_RESET_INTERVAL_DAYS_SUGGESTION = 30;

/**
 * Discord embed 렌더 fallback 색상(정수, 0xRRGGBB) — `NEWBIE_FORM_DEFAULTS`의 hex 값과 동일 색의
 * API 측 표현. `welcomeEmbedColor`/`mocoEmbedColor`는 `#5865F2`(=0x5865f2),
 * `missionEmbedColor`는 `#57F287`(=0x57f287)와 동일 색이다.
 */
export const NEWBIE_EMBED_FALLBACK_COLOR_INT = {
  welcome: 0x5865f2,
  mission: 0x57f287,
  moco: 0x5865f2,
} as const;

/**
 * `mocoScorePerMinute` DTO 검증 범위(DR-12) — API `newbie-config-save.dto.ts`와
 * 웹 `newbie-api.ts` 2벌로 중복 선언돼 있던 것을 이 상수로 통합한다.
 * 최솟값 1 — 0(비활성) 불허, perSession/perUnique와 다름.
 */
export const MOCO_SCORE_PER_MINUTE_MIN = 1;
export const MOCO_SCORE_PER_MINUTE_MAX = 10;

export type NewbieConfigDefaults = typeof NEWBIE_CONFIG_DEFAULTS;
