import type { LevelConfigDto } from '../types/level';

/**
 * `level_config` 기본값 단일 정본. 엔티티 컬럼 default(`level-config.orm-entity.ts`)·
 * GET 프리필(`level-config.service.ts`)·배치 폴백(`default-level-config.ts`)·
 * 웹 폼 초기값(`settings/.../level/types.ts`)이 모두 본 상수를 참조한다.
 * 값은 기존 4소스와 동일 — 본 상수 신설은 기본값 변경이 아니다.
 */
export const LEVEL_CONFIG_DEFAULTS = {
  isEnabled: true,
  voiceXpPerMin: 10,
  msgXp: 5,
  msgXpDailyCap: 100,
  curveType: 'QUADRATIC',
  announceEnabled: true,
  announceChannelId: null,
  excludeAlone: true,
  excludeMicOff: false,
  excludeDeaf: true,
  excludeServerMuted: false,
  voiceXpDailyCapMin: 720,
  excludeAfkChannel: true,
  // U10 신규 — 현행 동작 무변경(길드원 전원 조회 가능, ADMIN_ONLY 아님)
  leaderboardVisibility: 'GUILD_MEMBER',
} as const;

/** 증분형 곡선 기본 파라미터 — 레벨 n→n+1 증분 XP = a*n² + b*n + c */
export const LEVEL_CURVE_PARAMS_DEFAULTS = { a: 2, b: 20, c: 100 } as const;

/** 참조형 필드까지 채운 완전 기본값(호출마다 새 인스턴스) — 엔티티/배치용. */
export function createLevelConfigDefaults() {
  return {
    ...LEVEL_CONFIG_DEFAULTS,
    curveParams: { ...LEVEL_CURVE_PARAMS_DEFAULTS },
    roleRewards: [] as { level: number; roleId: string }[],
    noXpChannelIds: [] as string[],
    // U10 신규 — leaderboardVisibility는 위 스프레드로 이미 포함(참조형이 아니라 수기 추가 불요)
    noXpRoleIds: [] as string[],
  };
}

/**
 * DTO/폼 전용 완전 기본값(호출마다 새 인스턴스) — `curveType`/`curveParams` 불포함(16키 고정,
 * U7에서 anti-AFK 6키 추가로 8키→14키, U10에서 가시성·No-XP 역할 2키 추가로 14키→16키).
 * `LevelConfigDto`는 U4 UI 미노출 필드(curveType/curveParams)를 의도적으로 제외한 타입이므로
 * `createLevelConfigDefaults()`(엔티티용, curveType/curveParams 포함)를 재사용하면 안 된다.
 * ⚠️ **반복 지적된 누락 지점**: 이 함수는 스프레드가 아니라 필드를 하나씩 나열하는 구조라서,
 * `LevelConfigDto`에 필드가 추가될 때마다 여기에도 수기로 추가해야 한다. 누락 시 저장은
 * 되는데 `GET /level-config` 응답에서 그 필드가 통째로 사라진다(U10 구현 계획 §S1-3 · QA Q6).
 */
export function createLevelConfigDtoDefaults(): Omit<LevelConfigDto, 'roleGrantWarning'> {
  return {
    isEnabled: LEVEL_CONFIG_DEFAULTS.isEnabled,
    voiceXpPerMin: LEVEL_CONFIG_DEFAULTS.voiceXpPerMin,
    msgXp: LEVEL_CONFIG_DEFAULTS.msgXp,
    msgXpDailyCap: LEVEL_CONFIG_DEFAULTS.msgXpDailyCap,
    roleRewards: [],
    announceEnabled: LEVEL_CONFIG_DEFAULTS.announceEnabled,
    announceChannelId: LEVEL_CONFIG_DEFAULTS.announceChannelId,
    noXpChannelIds: [],
    excludeAlone: LEVEL_CONFIG_DEFAULTS.excludeAlone,
    excludeMicOff: LEVEL_CONFIG_DEFAULTS.excludeMicOff,
    excludeDeaf: LEVEL_CONFIG_DEFAULTS.excludeDeaf,
    excludeServerMuted: LEVEL_CONFIG_DEFAULTS.excludeServerMuted,
    voiceXpDailyCapMin: LEVEL_CONFIG_DEFAULTS.voiceXpDailyCapMin,
    excludeAfkChannel: LEVEL_CONFIG_DEFAULTS.excludeAfkChannel,
    // U10 신규 — 아래 2필드가 R4(기본값 정본 동기화 누락)의 핵심 대상이다
    leaderboardVisibility: LEVEL_CONFIG_DEFAULTS.leaderboardVisibility,
    noXpRoleIds: [],
  };
}

export type LevelConfigDefaults = typeof LEVEL_CONFIG_DEFAULTS;
