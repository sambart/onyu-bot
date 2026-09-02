// API response types shared between api and web

export type {
  ActivityTrendMetrics,
  AdminAssistAnalysis,
  AdminAssistAnalysisNoticeCode,
  AdminAssistCatalogItem,
  AdminAssistCatalogResponse,
  AdminAssistContextResponse,
  AdminAssistFallback,
  AdminAssistKind,
  AdminAssistParameter,
  AdminAssistQuotaResponse,
  AdminAssistRecommendation,
  AdminAssistRecommendResponse,
  AdminAssistResultStatus,
  AdminAssistSource,
  DecliningChannelsMetrics,
  MemberActivityMetrics,
  NewMemberCohortMetrics,
  StructureLintMetrics,
} from './admin-assist';

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  items: T[];
}

export interface VoiceActivityData {
  guildId: string;
  guildName: string;
  timeRange: {
    start: string;
    end: string;
  };
  totalStats: {
    totalUsers: number;
    totalVoiceTime: number;
    totalMicOnTime: number;
    /** 🆕 F-GEMINI-024 — 전체 화면공유 시간 (초, 길드 합계) */
    totalStreamingTime: number;
    /** 🆕 F-GEMINI-024 — 전체 카메라 ON 시간 (초, 길드 합계) */
    totalVideoTime: number;
    avgDailyActiveUsers: number;
  };
  userActivities: Array<{
    userId: string;
    username: string;
    totalVoiceTime: number;
    totalMicOnTime: number;
    totalMicOffTime: number;
    aloneTime: number;
    activeChannels: Array<{
      channelId: string;
      channelName: string;
      duration: number;
    }>;
    activeDays: number;
    avgDailyVoiceTime: number;
    micUsageRate: number;
  }>;
  channelStats: Array<{
    channelId: string;
    channelName: string;
    totalVoiceTime: number;
    uniqueUsers: number;
    avgSessionDuration: number;
  }>;
  dailyTrends: Array<{
    date: string;
    totalVoiceTime: number;
    activeUsers: number;
    avgMicUsage: number;
  }>;
}

export type { AccessTokenPayload, AuthTokenPair } from './auth';
export type { MeCardThemeCategory, MeCardThemeKey } from './card-theme';
export {
  DEFAULT_ME_CARD_THEME,
  isMeCardThemeKey,
  ME_CARD_THEME_CATEGORIES,
  ME_CARD_THEME_CATEGORY_ORDER,
  ME_CARD_THEME_KEYS,
  ME_CARD_THEME_SWATCH,
} from './card-theme';
export type {
  CoPresenceDailyTrendPoint,
  CoPresenceGraphData,
  CoPresenceGraphEdge,
  CoPresenceGraphNode,
  CoPresenceIsolatedMember,
  CoPresencePairDetail,
  CoPresencePairItem,
  CoPresencePairsResponse,
  CoPresencePairsSortBy,
  CoPresencePairsSortOrder,
  CoPresencePairUser,
  CoPresenceSummary,
  CoPresenceTopPair,
  MeFriendsSummary,
  MePairDetailResponse,
  MeTopPeerItem,
  MeTopPeersResponse,
} from './co-presence';
export type { DiscordFailureEnvelope } from './discord-failure';
export * from './level';
export type {
  ActivityDailyOverview,
  MessageDailyRecord,
  MessageRankingRecord,
  VoiceRankingRecord,
} from './message-tracking';
export type { GuildQuotaItem, GuildQuotaResponse, MeQuotaItem, MeQuotaResponse } from './quota';
export * from './role-panel';
export type {
  PlanScope,
  PlanTier,
  PremiumEntitlementState,
  PremiumFeatureKey,
  PremiumUnavailableReason,
} from './subscription';
export { PREMIUM_FEATURE_CATALOG } from './subscription';
export type {
  CommandUsedDto,
  GuildLifecycleEventDto,
  GuildLifecycleEventType,
  LandingEventDto,
  LandingEventType,
  LandingReferrerDto,
  LandingStatsDto,
  PageViewDto,
  ReferrerGroup,
  WebVitalsDto,
  WebVitalsMetric,
} from './usage-analytics';
export {
  GUILD_LIFECYCLE_EVENT_TYPES,
  LANDING_EVENT_TYPES,
  REFERRER_GROUPS,
  WEB_VITALS_ABSOLUTE_MAX_MS,
  WEB_VITALS_MAX_MS,
  WEB_VITALS_MAX_SAMPLES_PER_KEY,
  WEB_VITALS_METRICS,
} from './usage-analytics';
export * from './voice-game';
