// 레벨 시스템(U4) 공유 타입·상수 (api/web 공통 사용)

// ── 응답/요청 DTO ──

/** 길드×레벨→역할 매핑 (roleRewards 요소, 최대 10개) */
export interface RoleReward {
  level: number;
  roleId: string;
}

/**
 * anti-AFK 음성 XP 자격 규칙의 주된 차감 사유 1개 (U7, F-LVL-22).
 * `DAILY_CAP`은 버킷 사유보다 항상 우선(상한이 걸린 날은 행동을 고쳐도 인정이 늘지 않으므로
 * 버킷 사유 표시가 오해를 유발한다). 버킷 사유 동점 시 표시 우선순위는
 * `ALONE` → `DEAF` → `MIC_OFF` → `SERVER_MUTED`(값 자체에는 영향 없는 결정론적 선택).
 * `NO_XP_CHANNEL`(F-LVL-22 개정 2026-10-22)은 XP 제외 채널(`noXpChannelIds` + AFK 채널) 체류가
 * 가장 큰 차감 몫일 때의 사유다 — 제외 채널 체류는 "오늘 음성"에는 포함되고 XP 에서만 빠진다.
 */
export type LevelDeductionReason =
  | 'ALONE'
  | 'MIC_OFF'
  | 'DEAF'
  | 'SERVER_MUTED'
  | 'DAILY_CAP'
  | 'NO_XP_CHANNEL';

/** 채널 1개의 최근 활동 합계 — 음성은 `voice_daily` 채널 행(`GLOBAL` 센티널 제외)만 합산한다 */
export interface LevelChannelActivityItem {
  channelId: string;
  /** 최근 `windowDays`일 체류 초 합 */
  voiceSec: number;
  /** 최근 `windowDays`일 메시지 수 합 */
  messageCount: number;
}

/**
 * GET `/api/guilds/:guildId/level-config/channel-activity` 응답 (F-LVL-33, A2).
 * 제외 채널 지정 전에 채널별 최근 활동량을 보여 주기 위한 읽기 전용 집계다.
 */
export interface LevelChannelActivityResponse {
  /** 집계 창 길이(일) — KST 오늘 포함 */
  windowDays: number;
  /** 활동이 있는 채널만. 정렬 순서는 계약이 아니다 */
  items: LevelChannelActivityItem[];
}

/** {@link computeNoXpShare} 결과 — 제외 채널이 최근 활동에서 차지하는 비중(0~1, 분모 0이면 null) */
export interface LevelNoXpShare {
  voiceShare: number | null;
  messageShare: number | null;
  isVoiceOver: boolean;
  isMessageOver: boolean;
  /** 음성 또는 메시지 비중이 임계 이상 */
  isOverThreshold: boolean;
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
 * 리더보드 가시성 설정값(U10, F-LVL-27). 🔒 "공개(전체 공개)" 값은 존재하지 않는다 —
 * 2026-09-04 법무 확정(PRD §1-4b)이며 스키마·앱 양쪽에 그 값이 없다.
 */
export const LEADERBOARD_VISIBILITY_VALUES = ['GUILD_MEMBER', 'ADMIN_ONLY'] as const;
export type LeaderboardVisibility = (typeof LEADERBOARD_VISIBILITY_VALUES)[number];

/** 웹 리더보드 지표 탭 값(U11, F-LVL-32). `xp`=전체 XP, `voice`=음성 시간, `message`=메시지 수 */
export const LEADERBOARD_METRIC_VALUES = ['xp', 'voice', 'message'] as const;
export type LeaderboardMetric = (typeof LEADERBOARD_METRIC_VALUES)[number];

/**
 * 값이 지원하는 리더보드 지표인지 검사하는 타입 가드. 대소문자 정규화 없이 정확 일치만 허용한다
 * (`'XP'` → false). 호출자는 false 일 때 `'xp'` 로 폴백한다(400 아님).
 */
export function isLeaderboardMetric(value: unknown): value is LeaderboardMetric {
  return (
    typeof value === 'string' && (LEADERBOARD_METRIC_VALUES as readonly string[]).includes(value)
  );
}

/**
 * 지표 탭(voice/message) 집계 창 길이(일). KST 기준 오늘 포함 고정 창이며 Pro 기간 필터가 아니다
 * (premium-policy §4.2·§5).
 */
export const LEADERBOARD_METRIC_WINDOW_DAYS = 90;

/**
 * 리더보드 접근 거부 사유 코드(U10, F-LVL-27). 현재 1종뿐이나 향후 확장 여지를 위해
 * 유니언으로 둔다.
 */
export type LeaderboardDeniedReason = 'LEADERBOARD_ADMIN_ONLY';

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
  /** `voice_daily.aloneSec`(혼자 있음)을 anti-AFK 차감 대상 버킷에 포함할지. 기본 true (U7, F-LVL-19) */
  excludeAlone: boolean;
  /** `micOffSec`(자기 뮤트) 차감 여부. 기본 false — 듣기 전용 참여자 오차감 방지 (U7, F-LVL-19) */
  excludeMicOff: boolean;
  /** `deafSec`(셀프 스피커 차단) 차감 여부. 기본 true (U7, F-LVL-19) */
  excludeDeaf: boolean;
  /**
   * `serverMutedSec`(관리자 강제뮤트) 차감 여부. 기본 false. `micOffSec`의 부분집합이므로
   * `excludeMicOff`와 동시 활성화돼도 최댓값 방식이 이중 차감을 막는다 (U7, F-LVL-19)
   */
  excludeServerMuted: boolean;
  /**
   * 하루(KST) 음성 XP 인정 분 상한(anti-AFK 차감 후 인정분 기준). 기본 720.
   * 🔒 `null` = 무제한(`0`이 아님 — `announceChannelId` nullable 관례 재사용, U7, F-LVL-20)
   */
  voiceXpDailyCapMin: number | null;
  /**
   * 디스코드 서버 AFK 채널 체류시간 자동 제외 on/off. 기본 true.
   * Discord REST 조회 실패 시 fail-open(제외하지 않고 정상 적립) (U7, F-LVL-21)
   */
  excludeAfkChannel: boolean;
  /**
   * 리더보드 가시성(2단). 기본 `'GUILD_MEMBER'`(현행 동작 무변경). 🔒 "공개" 값은 존재하지
   * 않는다(2026-09-04 법무 확정, PRD §1-4b) — 검색엔진 인덱싱 제어도 범위 밖 (U10, F-LVL-27)
   */
  leaderboardVisibility: LeaderboardVisibility;
  /**
   * XP 적립·리더보드 노출에서 제외할 역할 ID 목록(최대 50개 — `noXpChannelIds`와 동일 상한·
   * 패턴). 🔒 `noXpChannelIds`(정적 설정 조회만으로 판정 가능)와 달리 역할 보유 여부 판정에
   * Discord REST 조회가 필요하다 — `guild_role`은 역할 정의만 동기화하고 멤버↔역할 매핑은
   * DB 어디에도 없다 (U10, F-LVL-29)
   */
  noXpRoleIds: string[];
  /**
   * 채널 XP 배율 목록(최대 20개, F-LVL-35). 텍스트·음성 채널 공통. 같은 ID 를 `noXpChannelIds` 와
   * 동시에 지정할 수 없다(400). 항상 GET 응답에 포함된다. 저장 시 생략(undefined)하면 기존값 유지.
   */
  channelMultipliers: XpChannelMultiplier[];
  /**
   * 역할 XP 배율 목록(최대 20개, F-LVL-35). 보유한 배율 역할 중 최댓값 1개만 적용된다.
   * 같은 ID 를 `noXpRoleIds` 와 동시에 지정할 수 없다(400). 저장 시 생략하면 기존값 유지.
   */
  roleMultipliers: XpRoleMultiplier[];
  /**
   * 레벨업 공지 1인 1줄 템플릿(최대 200자, 줄바꿈 금지, 변수 `{user}` `{level}` `{xp}` `{role}` 만 허용).
   * `null` = 길드 언어 기본 템플릿 (F-LVL-36). 저장 시 생략하면 기존값 유지, `null`/빈 문자열이면 기본 복귀.
   */
  announceTemplate: string | null;
}

/** 채널 XP 배율 1건 (F-LVL-35). multiplier 는 소수 표현 0.1~5.0, 0.1 단위(정규화값). */
export interface XpChannelMultiplier {
  channelId: string;
  multiplier: number;
}

/** 역할 XP 배율 1건 (F-LVL-35). 보유 배율 역할 중 max 1개만 적용. */
export interface XpRoleMultiplier {
  roleId: string;
  multiplier: number;
}

/** 레벨업 공지 1줄 렌더 변수 (F-LVL-36). user/role 은 호출측이 만든 표시 문자열(api: 멘션, web: 샘플). */
export interface LevelAnnounceLineVars {
  user: string;
  level: number;
  xp: number;
  role: string;
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
  /**
   * 길드 내 순위(1-base, ROW_NUMBER 방식). U5 신규 — `LeaderboardService.getUserRank()` 재사용
   * (F-LVL-07). ✅ **U10 nullable 전환**: `user_level.hasNoXpRole=true`(No-XP 역할 보유자)면
   * 모집단 밖이라 순위가 정의되지 않으므로 `null`이며, `getUserRank()`를 호출조차 하지 않는다
   * (F-LVL-29). `level`/`xp`는 이 경우에도 계속 표시된다.
   */
  rank: number | null;
  /**
   * 리더보드 전체 유효 인원(봇 제외) — `LeaderboardService.getUserRankWithTotal()`이
   * `countLeaderboard()`(페이지네이션용 기존 카운트 쿼리)를 재사용해 함께 산출한다(R2, F-VOICE-063 §665).
   * `/미` 카드 레이아웃 A 히어로의 "#{rank} / {totalUsers}명" · 상위% · 순위 진행바 계산에 사용.
   * ✅ **U10 nullable 정규화**: `rank`와 함께 산출되며 `hasNoXpRole=true`면 함께 `null`이 된다.
   */
  totalUsers: number | null;
  /**
   * 오늘(KST) anti-AFK 차감(F-LVL-19) 후 일일 상한(F-LVL-20)까지 적용한 최종 인정 음성 분.
   * 항상 `todayTotalVoiceMin` 이하. U7 신규 — `totalUsers?`와 동일하게 optional
   * (생산자는 항상 채우되, 11개 스펙·리스팅 스크립트 리터럴 접촉을 피하기 위함, F-LVL-22)
   */
  todayCreditedVoiceMin?: number;
  /**
   * 오늘(KST) 총 체류 분 — GLOBAL 센티널 제외, **XP 제외 채널(noXpChannelIds·AFK 채널) 체류 포함**
   * (F-LVL-22 개정 2026-10-22, 결정 D1 (b) — 종전에는 제외 채널을 뺐다). U7 신규
   */
  todayTotalVoiceMin?: number;
  /** 주된 차감 사유 1개(U7, F-LVL-22). 차감이 0이면(X = Y) `null` */
  primaryDeductionReason?: LevelDeductionReason | null;
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
  /**
   * 길드 내 순위(1-base). ✅ **U10 nullable 전환**: No-XP 역할 보유자(`hasNoXpRole=true`)는
   * 모집단 밖이라 `null`(F-LVL-29). 웹은 이 경우 순위 행을 안내 문구로 대체한다.
   */
  rank: number | null;
  totalUsers: number | null;
  /**
   * 본인의 익명화 opt-out 현재 상태(U10, F-LVL-28). `/my/growth` 토글의 초기 상태를 별도
   * 조회 없이 얻기 위해 이 응답에 포함한다. 길드별 값이다.
   */
  hideNameFromOthers: boolean;
  /** 길드 레벨 역할 보상 — roleName 은 웹이 별도 조회해 해석(D 아래) */
  roleRewards: { level: number; roleId: string }[];
  /** 다음으로 받게 될 보상(현재 레벨 초과 중 최소). 없으면 null */
  nextRoleReward: { level: number; roleId: string } | null;
  /**
   * 오늘(KST) 인정 음성 분. `LevelSummary`와 동일 계산 결과를 그대로 통과시킨다(봇/웹 이원화
   * 없음, U7 신규 — required. 생산자가 `getMeLevel()` 단 하나이고 소비처가 웹 4파일뿐이라
   * `LevelSummary`의 optional 결정과 의도적으로 다르다, F-LVL-22)
   */
  todayCreditedVoiceMin: number;
  /** 오늘(KST) 총 체류 분. U7 신규 — required */
  todayTotalVoiceMin: number;
  /** 주된 차감 사유 1개(U7, F-LVL-22). 차감 0이면 null. required */
  primaryDeductionReason: LevelDeductionReason | null;
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
  /**
   * 길드 닉네임. 레코드 없으면 `userId` 폴백(inactive-member/co-presence 관례).
   * ✅ **U10 nullable 전환**: `isAnonymized=true`면 `null` — 서버는 실명을 내보내지 않고
   * 각 소비 표면이 자기 로케일 문구를 렌더한다(F-LVL-28).
   */
  nickName: string | null;
  /** Discord CDN URL. 멤버 레코드 없거나 아바타 없으면 `null`. ✅ U10: 익명화 시에도 `null` */
  avatarUrl: string | null;
  /** ✅ **U10 신규**. 이 행이 익명화 치환됐는지. `true`면 소비 표면이 placeholder를 렌더한다 */
  isAnonymized: boolean;
  level: number;
  xp: number;
  /**
   * 🔒 최근 90일 음성 시간(초). `metric=voice` 응답에서만 숫자, 그 외 `null` (endpoint-spec §5-5).
   */
  voiceSec: number | null;
  /** 🔒 최근 90일 메시지 수. `metric=message` 응답에서만 숫자, 그 외 `null` (endpoint-spec §5-5). */
  messageCount: number | null;
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
  /**
   * ✅ **U10 신규** — 가시성 판정 통과 여부. `false`면 `users: []` · `total: 0`이며 사유는
   * `deniedReason`에 담긴다. 🔒 403이 아니라 200 정상 응답으로 내려온다(`isEnabled` 처리와
   * 동일 스타일, F-LVL-27).
   */
  visible: boolean;
  /** ✅ **U10 신규** — 거부 사유 코드. `visible=true`면 `null` */
  deniedReason: LeaderboardDeniedReason | null;
  /** ✅ **U11 신규** — 적용된 지표 에코(미지원·생략 요청은 `'xp'`) */
  metric: LeaderboardMetric;
  /**
   * ✅ **U11 신규** — 요청자의 해당 지표 기준 순위(1-base, xp 포함 단일 규칙). 요청자가 모집단 밖이거나
   * 식별 불가·비활성·가시성 거부면 `null`.
   */
  myRank: number | null;
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

// ── 멤버 XP 수동 조정 (docs/plans/level-member-xp-adjust.md, F-LVL-34) ──

/** 수동 조정 모드 — add: 가산 / remove: 차감(0 하한) / set: 절대값 지정 */
export const LEVEL_XP_ADJUST_MODES = ['add', 'remove', 'set'] as const;
export type LevelXpAdjustMode = (typeof LEVEL_XP_ADJUST_MODES)[number];

export interface LevelXpAdjustmentRequest {
  mode: LevelXpAdjustMode;
  amount: number;
  reason: string;
}

export type LevelXpAdjustNotAdjustableReason = 'BOT' | 'NOT_IN_GUILD';

/** 멤버 XP 상태 조회 응답 (endpoint-spec §5-13) */
export interface LevelMemberXpState {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  xp: number;
  level: number;
  hasUserLevelRow: boolean;
  hasNoXpRole: boolean;
  adjustable: boolean;
  notAdjustableReason: LevelXpAdjustNotAdjustableReason | null;
  curveParams: LevelCurveParams;
}

/** 조정 결과 응답 201 (endpoint-spec §5-14) */
export interface LevelXpAdjustmentResult {
  adjustmentId: string;
  mode: LevelXpAdjustMode;
  amount: number;
  xpBefore: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  clamped: boolean;
  roleGrantAttempted: boolean;
  /** ISO 8601 UTC */
  createdAt: string;
}

/** 조정 이력 목록 행 (endpoint-spec §5-15) */
export interface LevelXpAdjustmentListItem {
  id: string;
  targetUserId: string;
  targetDisplayName: string | null;
  targetAvatarUrl: string | null;
  actorUserId: string;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  mode: LevelXpAdjustMode;
  amount: number;
  xpBefore: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  reason: string;
  createdAt: string;
}

export interface LevelXpAdjustmentListResponse {
  items: LevelXpAdjustmentListItem[];
  nextCursor: string | null;
}
