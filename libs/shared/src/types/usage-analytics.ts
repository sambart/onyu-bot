/** Bot → API 커맨드 사용 수집 payload — 유저 ID·인자 미포함 (개인 미식별 🔒) */
export interface CommandUsedDto {
  guildId: string;
  commandName: string;
  locale: string;
}

/** Web(api route) → API 페이지뷰 수집 payload — 방문자 미식별 🔒 (path 는 route 에서 정규화 완료) */
export interface PageViewDto {
  path: string;
  country: string; // cloudfront-viewer-country 헤더 검증값 또는 'XX' 폴백 (F-USAGE-008, CloudFront 컷오버 완료)
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

// ── Web Vitals RUM 수집 (WEB-VITALS-RUM, F-USAGE-021~027) ──

/** Web Vitals RUM 수집 지표 화이트리스트 2종 (F-USAGE-021, §16-1 OUT — CLS/INP/FCP 제외) */
export const WEB_VITALS_METRICS = ['TTFB', 'LCP'] as const;
export type WebVitalsMetric = (typeof WEB_VITALS_METRICS)[number];

/** 지표별 값 상한(ms) — 초과 시 폴백 없이 폐기 (F-USAGE-022, 계획 D3) */
export const WEB_VITALS_MAX_MS: Record<WebVitalsMetric, number> = { TTFB: 60_000, LCP: 120_000 };

/** DTO 정적 검증용 절대 상한 — class-validator @Max()가 지표별 값을 표현할 수 없어 둔다(계획 D3) */
export const WEB_VITALS_ABSOLUTE_MAX_MS = 120_000;

/**
 * Web Vitals Redis 버퍼 키(국가×지표×일)당 표본 상한. 무인증 비컨 경로의 남용이 공유 Redis
 * (maxmemory 256mb / noeviction)를 고갈시키지 못하도록 카디널리티를 묶는다(PR #401 리뷰 ④).
 * 초과분은 조용히 드롭한다 — 분위수(p50/p75)는 이 표본 수에서 이미 충분히 안정적이다.
 * 운영 판독: `web_vitals_daily.sampleCount` 가 정확히 이 값이면 그 키는 포화 상태다.
 */
export const WEB_VITALS_MAX_SAMPLES_PER_KEY = 5_000;

/** Web(api route) → API Web Vitals 수집 payload — 방문자 미식별 🔒 (country 는 route 가 헤더로 판정) */
export interface WebVitalsDto {
  metric: WebVitalsMetric;
  value: number;
  country: string;
}
