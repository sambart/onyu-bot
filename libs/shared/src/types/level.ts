// 레벨 시스템(U4) 공유 타입·상수 (api/web 공통 사용)

// ── 응답/요청 DTO ──

/** 길드×레벨→역할 매핑 (roleRewards 요소, 최대 10개) */
export interface RoleReward {
  level: number;
  roleId: string;
}

/**
 * `level_config.curveParams` jsonb 셰이프 — 증분형(2026-07-23 확정 전환).
 * 의미: 레벨 n→n+1 증분 XP = a*n² + b*n + c (누적 필요 XP는 `LevelService.requiredXp` 닫힌 식 참조).
 * 원본 정의처는 `apps/api/src/level/infrastructure/level-config.orm-entity.ts` — 그쪽은
 * `export type { LevelCurveParams } from '@onyu/shared';` 재수출로 전환될 예정이다(S1, P4).
 */
export interface LevelCurveParams {
  a: number;
  b: number;
  c: number;
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
 * 레코드 없음/isEnabled=false면 `null`.
 */
export interface LevelSummary {
  level: number;
  xp: number;
  nextLevelRequiredXp: number;
  progressRatio: number;
  /** 길드 내 순위(1-base, ROW_NUMBER 방식). U5 신규 — `LeaderboardService.getUserRank()` 재사용 (F-LVL-07) */
  rank: number;
  /**
   * 리더보드 전체 유효 인원(봇 제외) — `LeaderboardService.getUserRankWithTotal()`이
   * `countLeaderboard()`(페이지네이션용 기존 카운트 쿼리)를 재사용해 함께 산출한다(R2, F-VOICE-063 §665).
   * `/미` 카드 레이아웃 A 히어로의 "#{rank} / {totalUsers}명" · 상위% · 순위 진행바 계산에 사용.
   * 조회 실패 시(rank와 함께 Promise.all로 조회되므로 실패하면 summary 자체가 null) 정의되지 않을 수 있어
   * optional — 소비처(렌더러)는 없으면 순위만 표시하는 안전 폴백을 유지한다.
   */
  totalUsers?: number;
}

/** GET /api/users/me/level 응답 (트랙 D) */
export interface MeLevelResponse {
  level: number;
  xp: number;
  /** 다음 레벨까지 필요한 총 XP */
  nextLevelRequiredXp: number;
  /** 다음 레벨까지 남은 XP = max(0, nextLevelRequiredXp - xp) */
  remainingXp: number;
  progressRatio: number;
  rank: number;
  totalUsers: number | null;
  /** 길드 레벨 역할 보상 — roleName 은 웹이 별도 조회해 해석(D 아래) */
  roleRewards: { level: number; roleId: string }[];
  /** 다음으로 받게 될 보상(현재 레벨 초과 중 최소). 없으면 null */
  nextRoleReward: { level: number; roleId: string } | null;
}

/**
 * 리더보드 1행 (`GET /api/guilds/:guildId/level/leaderboard` 응답 요소, F-LVL-15).
 * 이름에 `Level` 접두사를 붙여 diagnosis 도메인의 동명 `LeaderboardUser`/`LeaderboardResponse`
 * (voice-analytics, `libs/shared/src/types/diagnosis.ts`)와 배럴(`index.ts`) re-export 충돌을 피한다
 * (구현 시 발견 — endpoint-spec/PRD 원 명칭 `LeaderboardEntry`/`LeaderboardResponse`에서 변경).
 */
export interface LevelLeaderboardEntry {
  /** 순위(1-base). `(page-1)*limit + 순번` — ROW_NUMBER 방식(순위 공유 없음) */
  rank: number;
  userId: string;
  /** 길드 닉네임. 레코드 없으면 `userId` 폴백(inactive-member/co-presence 관례) */
  nickName: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
}

/** 리더보드 응답 루트 (결정 A: 에코형 — `page`/`limit` 요청값 에코 포함) */
export interface LevelLeaderboardResponse {
  /** 봇 제외 후 전체 유효 인원. `isEnabled=false`면 `0` */
  total: number;
  /** 요청 page 에코 */
  page: number;
  /** 요청 limit 에코 */
  limit: number;
  users: LevelLeaderboardEntry[];
  /**
   * 길드 레벨 시스템 활성 여부 (✅ 2026-08-01 신규, F-LVL-15).
   * `level_config` 행 부재 시 `true`(컬럼 기본값과 동일), 명시적 `false` 만 `false`.
   * 웹이 "레벨 비활성" vs "활성인데 아직 집계 전" 빈 상태를 구분하는 데 쓴다(F-WEB-008).
   */
  isEnabled: boolean;
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
