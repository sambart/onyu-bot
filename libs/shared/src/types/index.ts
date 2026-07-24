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

export * from './level';
export type {
  ActivityDailyOverview,
  MessageDailyRecord,
  MessageRankingRecord,
} from './message-tracking';
export * from './role-panel';
export type {
  AdminHealthResponse,
  AiUsageDist,
  AuditLogListResponse,
  AuditLogView,
  BotHealthSnapshot,
  CommandUsageDist,
  GuildUsageDetailResponse,
  GuildUsageRow,
  PlatformPageView,
  UsageSummaryResponse,
} from './super-admin';
export type { CommandUsedDto, PageViewDto } from './usage-analytics';
export * from './voice-game';
