/** Bot → API 커맨드 사용 수집 payload — 유저 ID·인자 미포함 (개인 미식별 🔒) */
export interface CommandUsedDto {
  guildId: string;
  commandName: string;
  locale: string;
}

/** Web(api route) → API 페이지뷰 수집 payload — 방문자 미식별 🔒 (path 는 route 에서 정규화 완료) */
export interface PageViewDto {
  path: string;
  country: string; // 현재 항상 'XX' (F-USAGE-008)
}

// ── U9a-3 성장 관측(Growth Observability) 수집 ──

/** 길드 생애주기 이벤트 유형 화이트리스트 (F-USAGE-013/014) */
export const GUILD_LIFECYCLE_EVENT_TYPES = ['join', 'leave'] as const;
export type GuildLifecycleEventType = (typeof GUILD_LIFECYCLE_EVENT_TYPES)[number];

/** 랜딩 유입 채널 화이트리스트 6종 (F-USAGE-017) — 원본 리퍼러 URL 대신 이 값으로 치환해 수집 */
export const REFERRER_GROUPS = [
  'topgg',
  'koreanbots',
  'discord_directory',
  'google_organic',
  'direct',
  'other',
] as const;
export type ReferrerGroup = (typeof REFERRER_GROUPS)[number];

/** 랜딩 CTA 클릭 이벤트 유형 화이트리스트 (F-USAGE-018) */
export const LANDING_EVENT_TYPES = ['cta_invite_click', 'cta_features_click'] as const;
export type LandingEventType = (typeof LANDING_EVENT_TYPES)[number];

/** Bot → API 길드 생애주기 수집 payload — 유저 ID·길드명·멤버수 미포함 (개인 미식별 🔒) */
export interface GuildLifecycleEventDto {
  guildId: string;
  eventType: GuildLifecycleEventType;
}

/** Web(api route) → API 랜딩 리퍼러 수집 payload — 방문자 미식별 🔒 (그룹/캠페인 화이트리스트 치환 완료) */
export interface LandingReferrerDto {
  referrerGroup: ReferrerGroup;
  campaign: string; // utm_campaign 화이트리스트 값, 없으면 'none' (F-USAGE-017)
}

/** Web(api route) → API 랜딩 CTA 클릭 수집 payload — 방문자 미식별 🔒 */
export interface LandingEventDto {
  eventType: LandingEventType;
  referrerGroup: ReferrerGroup;
}

/**
 * 랜딩 공개 스탯 스냅샷(F-WEB-024) — 길드 수는 의도적으로 포함하지 않는다
 * (소셜 프루프 역효과 — 계획 landing-live-stats.md §2.2).
 */
export interface LandingStatsDto {
  /** 누적 음성 활동 초(전 길드 합, GLOBAL 센티널 제외) */
  totalVoiceSeconds: number;
  /** 초당 증가율 — 최근 7일 합계 ÷ 604800. 클라이언트 외삽의 기울기 */
  voiceSecondsPerSecond: number;
  /** 활성·비봇 멤버 수(전 길드 합) */
  activeMemberCount: number;
  /** 스냅샷 산출 시각(ISO 8601 UTC) — 클라이언트가 경과시간 보정에 사용 */
  capturedAt: string;
}
