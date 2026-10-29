import type { SupportedLocale } from '../constants/locale';

export type RecapWindowPhase = 'not_started' | 'open' | 'ended';

export interface RecapHero {
  kind: 'voice' | 'message';
  unit: 'hour' | 'minute' | 'message';
  value: number; // 정수(버림)
}

/** W1 `data` — 스냅샷 payload v1 의 1차 노출분만. peerId·monthly·topChannels·weekdayDist 없음 */
export interface MeRecapData {
  voiceSeconds: number;
  messageCount: number;
  activeDays: number;
  longestStreak: number;
  hero: RecapHero;
  topChannel: { channelName: string; seconds: number } | null;
  topTextChannel: { channelName: string; messageCount: number } | null;
  peakWeekday: { index: number; ratio: number } | null; // 0=월 … 6=일
  topGame: { gameName: string; minutes: number } | null;
  hottestMonth: { month: number; seconds: number } | null; // 1~12
  bestFriend: { minutes: number; meetDays: number } | null; // 항상 익명 — 식별 키 없음
  activityType: {
    type: string; // 판정기 코드(kebab)
    label: string; // 요청 locale 라벨(ACTIVITY_TYPE_LABEL)
    emoji: string;
    basisFrom: string; // YYYY-MM-DD
    basisTo: string;
  } | null;
}

export interface MeRecapResponse {
  year: number;
  status: 'ready' | 'empty';
  countedFrom: string | null; // YYYY-MM-DD(KST)
  countedTo: string | null;
  generatedAt: string | null; // ISO
  data: MeRecapData | null;
}

export type MeRecapCardResponse =
  | { status: 'ready'; imageBase64: string; generatedAt: string }
  | { status: 'empty'; imageBase64: null; generatedAt: null };

/** B1 응답 — API 와 bot-api-client 가 같은 타입을 쓴다(수기 SDK 드리프트 방지) */
export interface MeRecapBotResponse {
  ok: boolean;
  status: 'ready' | 'empty' | 'not_started' | 'ended';
  data: { imageBase64: string } | null;
  summary: {
    year: number;
    hero: RecapHero;
    messageCount: number;
    activityType: string | null;
    activityTypeLabel: string | null;
  } | null;
}

/** 서버 결산 게시 이력 실패·건너뜀 사유 코드(`params.reason` 과 같은 이름) */
export type GuildRecapPostFailReason =
  | 'channel_unreachable'
  | 'missing_permissions'
  | 'discord_send_failed'
  | 'ownership_unverifiable'
  | 'foreign_channel'
  | 'gone_channel'
  | 'timeout_unknown'
  | 'stale_pending';

/** 자동 게시 상태 표시값(11종) */
export type GuildRecapAutoPostState =
  | 'off'
  | 'not_eligible'
  | 'scheduled'
  | 'in_progress'
  | 'retrying'
  | 'sent'
  | 'failed'
  | 'unknown'
  | 'skipped'
  | 'superseded'
  | 'not_posted';

export interface GuildRecapAutoPostStatus {
  enabled: boolean;
  weeklyReport: {
    isEnabled: boolean;
    channelId: string | null;
    hour: number;
    timezone: string;
    locale: SupportedLocale;
  } | null;
  state: GuildRecapAutoPostState;
  attempt: number;
  maxAttempts: number;
  failReason: GuildRecapPostFailReason | null;
  nextAttemptAfter: string | null; // ISO
  channelId: string | null;
  messageId: string | null;
  postedAt: string | null; // ISO
}

/** S1 응답 — 창 밖이면 `data`·`manual` 이 null */
export interface GuildRecapStatusResponse {
  year: number;
  phase: RecapWindowPhase;
  data: {
    status: 'ready' | 'empty' | 'unavailable';
    countedFrom: string | null;
    countedTo: string | null;
    isFinal: boolean;
    generatedAt: string | null;
  } | null;
  manual: {
    limit: number;
    used: number;
    remaining: number;
    canPost: boolean;
    blockedReason: 'no_data' | 'no_snapshot' | 'limit_reached' | null;
  } | null;
  autoPost: GuildRecapAutoPostStatus;
  channelPosts: Array<{
    channelId: string;
    posts: Array<{
      triggerType: 'auto' | 'manual';
      messageId: string;
      postedAt: string;
      usedFallback: boolean;
    }>;
  }>;
}

/** S2 응답 */
export type GuildRecapCardResponse =
  | {
      status: 'ready';
      imageBase64: string;
      locale: SupportedLocale;
      altText: string;
      countedFrom: string;
      countedTo: string;
      generatedAt: string;
    }
  | { status: 'empty'; reason: 'no_data' | 'no_snapshot'; imageBase64: null };

/** S3 요청 */
export interface GuildRecapPostRequest {
  channelId: string;
  locale: SupportedLocale;
}

/** S3 응답 */
export interface GuildRecapPostResponse {
  success: true;
  messageId: string;
  channelId: string;
  usedFallback: boolean;
  manual: { used: number; remaining: number };
}

/** S4 요청 */
export interface GuildRecapAutoPostRequest {
  enabled: boolean;
}

/** S4 응답 */
export type GuildRecapAutoPostResponse = GuildRecapAutoPostStatus;
