// 레벨 시스템(U4) 공유 타입·상수 (api/web 공통 사용)

// ── 응답/요청 DTO ──

/** 길드×레벨→역할 매핑 (roleRewards 요소, 최대 10개) */
export interface RoleReward {
  level: number;
  roleId: string;
}

/**
 * 레벨 설정 (GET/PUT `/api/guilds/:guildId/level-config` 응답).
 * `curveType`/`curveParams`는 U4 UI 미노출(시스템 고정값) — 포함하지 않는다.
 */
export interface LevelConfigDto {
  isEnabled: boolean;
  voiceXpPerMin: number;
  msgXp: number;
  msgXpDailyCap: number;
  roleRewards: RoleReward[];
  announceEnabled: boolean;
  announceChannelId: string | null;
  /** 역할 부여 연속 실패 임계치(5회) 초과 경고 배지 플래그 (F-LVL-04 (c)) */
  roleGrantWarning: boolean;
  /** XP 적립에서 제외할 채널 ID 목록(음성·메시지 공통 적용, 2026-07-23 확정) */
  noXpChannelIds: string[];
}

/**
 * `/me` 캔버스 레벨 카드 입력 (bot-api 내부 조립 — HTTP 응답 아님).
 * 레코드 없음/isEnabled=false면 `null`. 순위(rank) 필드 없음(U5 범위).
 */
export interface LevelSummary {
  level: number;
  xp: number;
  nextLevelRequiredXp: number;
  progressRatio: number;
}

// ── Discord 고위험 권한 비트 (레벨 역할 자동 부여 안전장치 §5.2) ──
// BigInt 생성자 사용 — 리터럴은 target ES2020 미만 소비자(web=ES2017)에서 TS2737 에러
// (`libs/shared/src/types/role-panel.ts:71-75` 패턴 그대로).

/** BigInt 1 기저 값 (비트 시프트 계산용) */
const BIGINT_ONE = BigInt(1);

/** Discord KICK_MEMBERS 권한 비트 위치 */
const KICK_MEMBERS_BIT_POSITION = BigInt(1);

/** Discord BAN_MEMBERS 권한 비트 위치 */
const BAN_MEMBERS_BIT_POSITION = BigInt(2);

/** Discord MANAGE_GUILD 권한 비트 위치 */
const MANAGE_GUILD_BIT_POSITION = BigInt(5);

/** Discord MANAGE_ROLES 권한 비트 위치 */
const MANAGE_ROLES_BIT_POSITION = BigInt(28);

/** Discord KICK_MEMBERS 권한 비트마스크 (1 << 1 = 2) */
export const DISCORD_KICK_MEMBERS_BIT = BIGINT_ONE << KICK_MEMBERS_BIT_POSITION;

/** Discord BAN_MEMBERS 권한 비트마스크 (1 << 2 = 4) */
export const DISCORD_BAN_MEMBERS_BIT = BIGINT_ONE << BAN_MEMBERS_BIT_POSITION;

/** Discord MANAGE_GUILD 권한 비트마스크 (1 << 5 = 32) */
export const DISCORD_MANAGE_GUILD_BIT = BIGINT_ONE << MANAGE_GUILD_BIT_POSITION;

/** Discord MANAGE_ROLES 권한 비트마스크 (1 << 28 = 268435456) */
export const DISCORD_MANAGE_ROLES_BIT = BIGINT_ONE << MANAGE_ROLES_BIT_POSITION;
