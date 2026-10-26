import type { LevelConfigDto, XpChannelMultiplier, XpRoleMultiplier } from '../types/level';

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
  // U13 신규 — null = 길드 언어 기본 템플릿 (F-LVL-36)
  announceTemplate: null,
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
    // U13 신규 — 배율 없음(= 전 채널·역할 1.0배)
    channelMultipliers: [] as XpChannelMultiplier[],
    roleMultipliers: [] as XpRoleMultiplier[],
  };
}

/**
 * DTO/폼 전용 완전 기본값(호출마다 새 인스턴스) — `curveType`/`curveParams` 불포함(19키 고정,
 * U7에서 anti-AFK 6키 추가로 8키→14키, U10에서 가시성·No-XP 역할 2키 추가로 14키→16키,
 * U13에서 배율 2키·공지 템플릿 1키 추가로 16키→19키).
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
    // U13 신규 — 누락 시 GET 응답에서 3필드가 사라진다(위 ⚠️)
    channelMultipliers: [],
    roleMultipliers: [],
    announceTemplate: LEVEL_CONFIG_DEFAULTS.announceTemplate,
  };
}

export type LevelConfigDefaults = typeof LEVEL_CONFIG_DEFAULTS;

/** 제외 채널 비중 집계 창(일, KST 오늘 포함) — 진단 카드·설정 화면 공용 (F-LVL-33) */
export const LEVEL_NO_XP_SHARE_WINDOW_DAYS = 7;

/**
 * 제외 채널 비중 경고 임계(0~1) — 최근 창의 음성 또는 메시지 중 한쪽이라도 이 값 이상이면
 * 경고한다(2026-10-22 결정 D2 (a)).
 */
export const LEVEL_NO_XP_SHARE_WARN_RATIO = 0.5;

// ── 멤버 XP 수동 조정 (F-LVL-34) ──

/** 1회 조정량 상한 — add/remove/set 3모드 공통 */
export const LEVEL_XP_ADJUST_AMOUNT_MAX = 1_000_000;

/** 조정 사유 최대 길이(자) */
export const LEVEL_XP_ADJUST_REASON_MAX_LENGTH = 200;

/** 조정 이력 목록 기본 페이지 크기 */
export const LEVEL_XP_ADJUST_HISTORY_LIMIT_DEFAULT = 20;

/** 조정 이력 목록 최대 페이지 크기 (초과 시 400) */
export const LEVEL_XP_ADJUST_HISTORY_LIMIT_MAX = 50;

/**
 * GDPR 삭제 요청으로 익명화된 실행자(Discord user ID) sentinel — api 의 감사 로그·조정 이력과 값이 동일해야 한다.
 * 웹이 '삭제된 사용자' 표기 판정에 쓴다. 값 변경 금지(이미 치환된 과거 행과 불일치).
 */
export const ANONYMIZED_ACTOR_DISCORD_USER_ID = 'anonymized_user';

// ── 역할/채널 XP 배율 (F-LVL-35) ──

/** 배율 허용 최솟값/최댓값(소수 표현) */
export const LEVEL_XP_MULTIPLIER_MIN = 0.1;
export const LEVEL_XP_MULTIPLIER_MAX = 5;

/** 배율 ×10 정수 표현의 최솟값/최댓값/중립값(1.0배) — 엔진 내부 정수 연산용 */
export const LEVEL_XP_MULTIPLIER_X10_MIN = 1;
export const LEVEL_XP_MULTIPLIER_X10_MAX = 50;
export const LEVEL_XP_MULTIPLIER_X10_NEUTRAL = 10;

/** 0.1 단위 판정 허용 오차(부동소수 `0.1+0.2` 류 흡수) */
export const LEVEL_XP_MULTIPLIER_STEP_TOLERANCE = 1e-6;

/** 채널/역할 배율 목록 최대 개수(Free) */
export const LEVEL_CHANNEL_MULTIPLIERS_MAX_SIZE = 20;
export const LEVEL_ROLE_MULTIPLIERS_MAX_SIZE = 20;

// ── 레벨업 알림 템플릿 (F-LVL-36) ──

/** 템플릿 최대 길이(코드포인트) */
export const LEVEL_ANNOUNCE_TEMPLATE_MAX_LENGTH = 200;

/** 템플릿에서 허용하는 변수 이름(닫힌 집합) */
export const LEVEL_ANNOUNCE_TEMPLATE_VARIABLES = ['user', 'level', 'xp', 'role'] as const;

/** 렌더된 1줄 최대 길이(코드포인트) — 초과 시 절단 + `…` */
export const LEVEL_ANNOUNCE_LINE_MAX_LENGTH = 1024;
