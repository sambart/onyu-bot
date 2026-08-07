// API response types shared between api and web

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

export type { AuthTokenPair } from './auth';
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
  CommandUsedDto,
  GuildLifecycleEventDto,
  GuildLifecycleEventType,
  LandingEventDto,
  LandingEventType,
  LandingReferrerDto,
  LandingStatsDto,
  PageViewDto,
  ReferrerGroup,
} from './usage-analytics';
export {
  GUILD_LIFECYCLE_EVENT_TYPES,
  LANDING_EVENT_TYPES,
  REFERRER_GROUPS,
} from './usage-analytics';
export * from './voice-game';
