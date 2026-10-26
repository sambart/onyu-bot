// API response types shared between api and web

export type {
  ActivityTrendMetrics,
  AdminAssistAnalysis,
  AdminAssistAnalysisNoticeCode,
  AdminAssistCatalogItem,
  AdminAssistCatalogResponse,
  AdminAssistDiagnosis,
  AdminAssistDiagnosisItem,
  AdminAssistDiagnosisStatus,
  AdminAssistExecutableProposal,
  AdminAssistExecutedAction,
  AdminAssistExecuteDomainCode,
  AdminAssistExecutedPublishAction,
  AdminAssistExecutedSettingAction,
  AdminAssistExecutedSettingApplied,
  AdminAssistExecutedSettingClaim,
  AdminAssistExecuteErrorDetails,
  AdminAssistExecuteFailureObservation,
  AdminAssistExecuteNotExecutableReason,
  AdminAssistExecuteRejectionCode,
  AdminAssistExecuteRejectionObservation,
  AdminAssistExecuteRequest,
  AdminAssistExecuteResponse,
  AdminAssistExplanation,
  AdminAssistFallback,
  AdminAssistFallbackSuggestion,
  AdminAssistFeedback,
  AdminAssistGeneration,
  AdminAssistGenerativeAction,
  AdminAssistKind,
  AdminAssistLinkOnlyProposal,
  AdminAssistParameter,
  AdminAssistProposal,
  AdminAssistProposalChange,
  AdminAssistProposalLinkOnlyReason,
  AdminAssistProposalObservation,
  AdminAssistPublishHistoryItem,
  AdminAssistPublishHistoryResponse,
  AdminAssistPublishRequest,
  AdminAssistPublishResponse,
  AdminAssistQuotaResponse,
  AdminAssistRatingRequest,
  AdminAssistRatingResponse,
  AdminAssistRecommendation,
  AdminAssistRecommendResponse,
  AdminAssistResultStatus,
  AdminAssistSource,
  AdminAssistSurface,
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

export type {
  AdminLogConfigDto,
  AdminLogKind,
  AdminLogPayloadMap,
  AdminLogQuotaScope,
  NewbieOnboardingFailureDto,
} from './admin-log';
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
  MeCoPresencePrivacyRequest,
  MeCoPresencePrivacyResponse,
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
export * from './period';
export type { GuildQuotaItem, GuildQuotaResponse, MeQuotaItem, MeQuotaResponse } from './quota';
export type {
  AdminReportAnonymizeRequest,
  AdminReportAnonymizeResult,
  AdminReportDetail,
  AdminReportLegalHoldRequest,
  AdminReportLegalHoldState,
  AdminReportListItem,
  AdminReportListQuery,
  AdminReportListResponse,
  AdminReportMemoRequest,
  AdminReportNotifyState,
  AdminReportStatusChangeRequest,
  AdminReportSummary,
  RelatedReportSummary,
  ReportEventView,
  ReportIntakeFormTokenResponse,
  ReportIntakeSubmitRequest,
  ReportIntakeSubmitResponse,
} from './report-intake';
export type {
  DataSufficiency,
  ReportActionAccess,
  ReportActionDefinition,
  ReportActionDomain,
  ReportActionItem,
  ReportActionKey,
  ReportActionSurface,
  ReportActionTarget,
  ReportMetric,
  ReportMetricKey,
  ReportMetricUnit,
  ReportSignal,
  ReportSignalBasis,
  ReportSignalEvidence,
  ReportSignalKey,
  ReportSignalKind,
  ReportSignalSeverity,
  StructuredReportConfidence,
  StructuredReportHypothesis,
  StructuredReportKeyChange,
  StructuredReportRecommendedAction,
  StructuredReportSufficiency,
  StructuredReportV2,
  SufficiencyLevel,
  SufficiencyReason,
  SufficiencyThresholds,
} from './report-pipeline';
export * from './role-panel';
export type {
  SettingsAuditLogItem,
  SettingsAuditLogListQuery,
  SettingsAuditLogListResponse,
} from './settings-audit';
export { SETTINGS_AUDIT_ACTOR_SENTINEL } from './settings-audit';
export type {
  PlanScope,
  PlanTier,
  PremiumEntitlementState,
  PremiumFeatureKey,
  PremiumUnavailableReason,
} from './subscription';
export { PREMIUM_FEATURE_CATALOG } from './subscription';
export type {
  AdminAssistCtaClickDto,
  AdminAssistCtaType,
  AutoActionDomain,
  AutoActionRecordDto,
  AutoActionType,
  CommandUsedDto,
  DwellBucket,
  EmptyStateSeenDto,
  GettingStartedStatusResponse,
  GuildLifecycleEventDto,
  GuildLifecycleEventType,
  LandingEventDto,
  LandingEventType,
  LandingReferrerDto,
  LandingStatsDto,
  MultiGuildLoginBucket,
  OverviewDwellDto,
  PageViewDto,
  ReferrerGroup,
  WebVitalsDto,
  WebVitalsMetric,
} from './usage-analytics';
export {
  ADMIN_ASSIST_CTA_TYPES,
  AUTO_ACTION_ALLOWED,
  AUTO_ACTION_DOMAINS,
  AUTO_ACTION_TYPES,
  DWELL_BUCKET_BOUNDARIES_MS,
  DWELL_BUCKETS,
  GUILD_LIFECYCLE_EVENT_TYPES,
  isAllowedAutoAction,
  LANDING_EVENT_TYPES,
  MULTI_GUILD_LOGIN_BUCKETS,
  OVERVIEW_DWELL_MAX_MS,
  REFERRER_GROUPS,
  resolveMultiGuildLoginBucket,
  toDwellBucket,
  WEB_VITALS_ABSOLUTE_MAX_MS,
  WEB_VITALS_MAX_MS,
  WEB_VITALS_MAX_SAMPLES_PER_KEY,
  WEB_VITALS_METRICS,
} from './usage-analytics';
export * from './voice-game';
