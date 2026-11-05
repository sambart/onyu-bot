export interface GuildOverviewResponse {
  totalMemberCount: number;
  todayVoiceTotalSec: number;
  currentVoiceUserCount: number;
  /** 활성 회원 비율(%). 수집 중이거나 분류 레코드 0건이면 null(미판정) — F-WEB-008 §1-b */
  activeRate: number | null;
  /** 비활동 분류가 아직 판정 불가 상태(수집 중 또는 레코드 0건)인지 — 웹 카드 분기용 */
  inactiveCollecting: boolean;
  /** 비활동 판정 기간(일) — 카드 툴팁 바인딩용. InactiveMemberConfig.periodDays */
  inactivePeriodDays: number;
  inactiveByGrade: {
    fullyInactive: number;
    lowActive: number;
    declining: number;
  };
  missionSummary: {
    inProgress: number;
    completed: number;
    failed: number;
  } | null;
  /** 오늘(KST) message_daily 합산 메시지 수 — 통합 활동 홈 요약 카드용 (R1) */
  todayMessageTotal: number;
}

/** F-WEB-040(V5) — 설정 건강도 판정 대상 9개 도메인(고정 순서 = 설정 사이드바 F-WEB-036 순서) */
export type SettingsHealthDomain =
  | 'voiceHealth'
  | 'autoChannel'
  | 'level'
  | 'newbie'
  | 'inactiveMember'
  | 'statusPrefix'
  | 'stickyMessage'
  | 'rolePanel'
  | 'weeklyReport';

/** F-WEB-043 — 카드 항목에 나올 수 있는 도메인. 판정 9도메인 + adminLog(자동 조치 항목으로만 표시, totalCount 미포함) */
export type SettingsHealthItemDomain = SettingsHealthDomain | 'adminLog';

export type SettingsHealthKind =
  | 'not_enabled'
  | 'dead_setting'
  | 'failing'
  | 'auto_disabled'
  | 'channel_deleted';
export type SettingsHealthSeverity = 'info' | 'warn' | 'error';

/** 기록 테이블 kind 컬럼 값 */
export type SettingsAutoActionKind = Extract<
  SettingsHealthKind,
  'auto_disabled' | 'channel_deleted'
>;

/** 기록 테이블 domain 컬럼 값(코드 enum, DB enum 아님) */
export type SettingsAutoActionDomain = SettingsHealthItemDomain;

export type SettingsAutoActionReasonCode =
  | 'moco_rank_missing_access'
  | 'moco_rank_unknown_channel'
  | 'weekly_report_channel_unreachable'
  | 'weekly_report_send_failed'
  | 'admin_log_channel_unreachable'
  | 'channel_deleted';

/** 채널 라이브 확인 결과. not_checked = 확인하지 않음(상위 3건 초과·캐시 실패 등) */
export type SettingsLiveCheck = 'accessible' | 'unreachable' | 'unknown' | 'not_checked';

export interface SettingsHealthAutoAction {
  /** bigint 문자열 */
  recordId: string;
  reasonCode: SettingsAutoActionReasonCode;
  targetField: string;
  /** ISO 8601 UTC */
  occurredAt: string;
  liveCheck: SettingsLiveCheck;
  canReenable: boolean;
}

/** SA2 응답(신규 해소·이미 해소 모두 200) */
export interface ReenableAutoActionResponse {
  ok: true;
  alreadyResolved: boolean;
}

export interface SettingsHealthItem {
  domain: SettingsHealthItemDomain;
  kind: SettingsHealthKind;
  severity: SettingsHealthSeverity;
  /** 딥링크 대상 — `/settings/guild/{guildId}/{path}?src=settings-health` (서버가 쿼리까지 부착한 완성형) */
  settingsPath: string;
  /** i18n reasonKey — `dashboard.overview.settingsHealth.reasons.{reasonKey}` */
  reasonKey: string;
  /** i18n 보간 인자 — 배열 금지(H-Q1). 복수 항목은 쉼표 조인 문자열(`'welcome, mission'`) */
  params?: Record<string, string | number>;
  /** kind 가 auto_disabled / channel_deleted 일 때만 존재 */
  autoAction?: SettingsHealthAutoAction;
}

export interface SettingsHealthResponse {
  summary: {
    /** 활성화된(끄지 않은) 도메인 수 — dead/failing 이어도 "켜져 있음"으로 카운트 */
    enabledCount: number;
    /** 고정 9 */
    totalCount: number;
    deadCount: number;
    failingCount: number;
    /** 자동 조치 기록 항목 수. 서버는 항상 채우며 FE 는 `?? 0` 으로 읽는다 */
    autoActionCount?: number;
  };
  /** 도메인당 최대 1건. 완전히 정상인 도메인은 항목을 만들지 않는다(최대 9건, 서버는 자르지 않는다) */
  items: SettingsHealthItem[];
}

/** F-WEB-008 §7 (D3) — 현재 접속 중인 음성 채널 1건 */
export interface LiveVoiceChannelEntry {
  /** Discord 채널 ID (ChannelOrm.discordChannelId — 내부 PK 가 아님) */
  channelId: string;
  channelName: string;
  userCount: number;
}

/** F-WEB-008 §7 (D3) — GET /api/guilds/{guildId}/overview/live-voice */
export interface LiveVoiceResponse {
  /** 접속자 0명이면 빈 배열 — 위젯은 숨기지 않고 안내 문구로 대체한다 */
  channels: LiveVoiceChannelEntry[];
  totalUserCount: number;
}

/** F-WEB-041 W1 — 예고 대상 도메인. 이름은 SettingsHealthDomain 과 같은 camelCase 표기를 따른다 */
export type FirstValueDomain =
  | 'weeklyReport'
  | 'inactiveMember'
  | 'newbie'
  | 'level'
  | 'statusPrefix'
  | 'voiceHealth';

/**
 * scheduled    — 서버가 다음 실행 시각을 계산했다 (nextAt 있음)
 * event        — 누군가 행동해야 일어난다 (nextAt 없음. 예: 새 멤버 가입)
 * immediate    — 활동 직후 짧은 배치 지연으로 반영된다 (nextAt 없음. 예: 레벨 5분 배치)
 * needsChannel — 켜져 있지만 채널 등 필수 조건이 없어 아직 아무 일도 일어나지 않는다
 */
export type FirstValueForecastKind = 'scheduled' | 'event' | 'immediate' | 'needsChannel';

export interface FirstValueForecast {
  domain: FirstValueDomain;
  kind: FirstValueForecastKind;
  /** ISO 8601 UTC. kind==='scheduled' 일 때만 값이 있고 나머지는 null */
  nextAt: string | null;
  /** i18n 보간 인자 — 도메인별 키는 endpoint-spec §2-3 표. 배열 금지(SettingsHealthItem.params 관례) */
  params?: Record<string, string | number | boolean>;
}

/** F-WEB-041 — GET /api/guilds/{guildId}/overview/first-value */
export interface FirstValueResponse {
  /** 봇 합류 시각(guild_onboarding_state.joinedAt). 행이 없으면 null */
  joinedAt: string | null;
  /** 첫 24시간 창. joinedAt 이 null 이면 null */
  firstDayWindow: { start: string; end: string; isOpen: boolean } | null;
  /** 개요 첫 가치 노출 여부 = joinedAt != null && now < joinedAt + 7일. 개요의 ② 블록과 ① 카드
   *  둘 다에 적용(위자드 STEP 5 는 무시) — 2026-09-30 메인 확정 */
  isFirstDayBlockVisible: boolean;
  /** 첫 24시간 누적치. isFirstDayBlockVisible=false 면 계산하지 않고 null. 집계 실패 시에도
   *  null(+warn) — 2026-09-30 메인 확정 */
  counts: { voiceMinutes: number; messageCount: number; autoActionCount: number } | null;
  /** 켜진 도메인만, §2-3 고정 순서. 켜진 도메인이 없으면 빈 배열 */
  forecasts: FirstValueForecast[];
  /** 서버 계산 기준 시각(ISO). 클라이언트 "진행 중" 표시·디버깅용 */
  generatedAt: string;
}

/**
 * F-WEB-008 §8 (D6) — GET /api/guilds/{guildId}/overview/weekly-kpi
 * 각 지표는 소유 도메인이 "미사용" 판정이면 null — 웹은 null 행을 렌더하지 않는다
 * (숫자 0 과 "기능 미사용" 을 구분하기 위해 optional 이 아니라 nullable 로 둔다).
 */
export interface WeeklyKpiResponse {
  /** 1. 이번 주 신규 획득 뱃지 수 — voice_health_config.isEnabled=false 면 null */
  badgesEarned: number | null;
  /** 2. 이번 주 비활동 감지 인원 수 — inactive_member_config 로우 부재면 null */
  inactiveDetected: number | null;
  /** 3. 이번 주 비활동 조치 건수 — 위 2와 동일 판정 */
  inactiveActions: number | null;
  /** 4. 이번 주 완료된 신규 미션 수 — newbie_config.missionEnabled=false 면 null */
  missionsCompleted: number | null;
  /** 5. 발송된 주간 리포트 여부 — weekly_report_config.isEnabled=false 면 null */
  weeklyReportSent: boolean | null;
  /** 6. 이번 주 레벨업 인원 수 — level_config.isEnabled=false 면 null */
  levelUps: number | null;
  /** 집계 대상 구간(YYYYMMDD, KST, 양끝 포함) — 오늘 포함 최근 7일 고정 */
  periodStart: string;
  periodEnd: string;
}

/**
 * F-WEB-045 — 설정 반영 주기.
 * every_5_min 5분 배치 · hourly 매시 배치 · daily_kst 매일 KST 배치 · weekly_guild_tz 길드 타임존 주 1회 ·
 * immediate 배치 없이 즉시 반영(API 응답에는 나오지 않고 웹 고정 문구용 어휘)
 */
export type ScheduleCadence =
  | 'every_5_min'
  | 'hourly'
  | 'daily_kst'
  | 'weekly_guild_tz'
  | 'immediate';

export type ScheduleStatusDomain =
  | 'level'
  | 'voiceHealth'
  | 'inactiveMember'
  | 'newbieMission'
  | 'newbieRole'
  | 'weeklyReport';

export interface ScheduleStatusItem {
  domain: ScheduleStatusDomain;
  cadence: ScheduleCadence;
  /** ISO 8601 UTC. weeklyReport 는 길드 설정 기준, 나머지는 크론 기준 다음 틱. 산출 불가 시 null */
  nextRunAt: string | null;
  /** 전역 배치(전 길드 순회)의 마지막 성공 시각 — 이 길드가 처리된 시각이 아니다.
   *  기록 없음/Redis 실패 = null */
  lastRunAt: string | null;
}

/** F-WEB-045 — GET /api/guilds/{guildId}/overview/schedule-status. 꺼짐·설정 없음 도메인은 제외 */
export type ScheduleStatusResponse = ScheduleStatusItem[];
