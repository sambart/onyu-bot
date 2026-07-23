import type {
  BadgeCriterionCode,
  BadgeCurrentCode,
  MessageCode,
  VerdictCategory,
  VerdictCategoryCode,
  VerdictCriterionCode,
  VerdictUnit,
} from '@onyu/shared';

/** Bot → API 요청/응답 DTO 타입 정의 */

// ── Voice ──

export interface VoiceStateUpdateDto {
  guildId: string;
  userId: string;
  channelId: string | null;
  oldChannelId: string | null;
  eventType:
    | 'join'
    | 'leave'
    | 'move'
    | 'mic_toggle'
    | 'streaming_toggle'
    | 'video_toggle'
    | 'deaf_toggle';

  // 기존 VoiceStateDto 대응 필드
  userName: string;
  channelName: string | null;
  oldChannelName: string | null;
  parentCategoryId: string | null;
  categoryName: string | null;
  oldParentCategoryId: string | null;
  oldCategoryName: string | null;
  micOn: boolean;
  avatarUrl: string | null;

  // 채널 멤버 정보 (alone 감지 + auto-channel empty 감지용)
  channelMemberCount: number;
  oldChannelMemberCount: number;
  channelMemberIds: string[];
  oldChannelMemberIds: string[];

  // Phase 1: VoiceState 추가 수집
  streaming?: boolean;
  selfVideo?: boolean;
  selfDeaf?: boolean;

  // Phase 2: 게임 활동 (optional — 게임 중이 아닐 수 있음)
  gameName?: string | null;
  gameApplicationId?: string | null;
}

// ── Newbie ──

export interface MemberJoinDto {
  guildId: string;
  memberId: string;
  displayName: string;
}

export interface MissionRefreshDto {
  guildId: string;
}

export interface MocoRankRequestDto {
  guildId: string;
  page: number;
}

export interface MocoMyHuntingRequestDto {
  guildId: string;
  userId: string;
}

export interface NewbieConfigDto {
  welcomeEnabled: boolean;
  welcomeChannelId: string | null;
  welcomeContent: string | null;
  welcomeEmbedTitle: string | null;
  welcomeEmbedDescription: string | null;
  welcomeEmbedColor: string | null;
  welcomeEmbedThumbnailUrl: string | null;
  missionEnabled: boolean;
  roleEnabled: boolean;
  newbieRoleId: string | null;
  roleDurationDays: number | null;
}

export interface RoleAssignedDto {
  guildId: string;
  memberId: string;
}

// ── Guild ──

export interface MemberDisplayNameResponse {
  userId: string;
  displayName: string;
}

export interface RoleModifyDto {
  guildId: string;
  memberId: string;
  roleId: string;
}

export interface KickMemberDto {
  guildId: string;
  memberId: string;
  reason?: string;
}

// ── Status Prefix ──

export interface StatusPrefixApplyDto {
  guildId: string;
  memberId: string;
  buttonId: number;
  currentDisplayName: string;
}

export interface StatusPrefixResetDto {
  guildId: string;
  memberId: string;
}

export interface StatusPrefixApplyResult {
  success: boolean;
  newNickname?: string;
  message: string;
  code?: MessageCode;
  params?: Record<string, string | number>;
}

export interface StatusPrefixResetResult {
  success: boolean;
  originalNickname?: string;
  message: string;
  code?: MessageCode;
  params?: Record<string, string | number>;
}

// ── Auto Channel ──

export interface AutoChannelButtonClickDto {
  guildId: string;
  userId: string;
  buttonId: number;
  voiceChannelId: string | null;
  displayName: string;
}

export interface AutoChannelSubOptionDto {
  guildId: string;
  userId: string;
  subOptionId: number;
  voiceChannelId: string | null;
  displayName: string;
}

export interface AutoChannelSubOptionInfo {
  id: number;
  label: string;
  emoji: string | null;
}

export interface AutoChannelButtonResult {
  action: 'created' | 'error' | 'show_sub_options';
  channelId?: string;
  channelName?: string;
  message: string;
  subOptions?: AutoChannelSubOptionInfo[];
  code?: MessageCode;
  params?: Record<string, string | number>;
}

// ── Sticky Message ──

export interface MessageCreatedDto {
  guildId: string;
  channelId: string;
  authorId: string;
  isBot: boolean;
}

export interface StickyMessageConfigItem {
  channelId: string;
  embedTitle: string | null;
  enabled: boolean;
}

// ── Message Tracking ──

/**
 * Bot → API 메시지 카운트 수집 payload (E1).
 * 메시지 내용(content)은 포함하지 않는다 — 메타데이터만 전송한다 (PRD §2 프라이버시 원칙).
 */
export interface MessageCountedDto {
  guildId: string;
  channelId: string;
  channelName: string;
  isThread: boolean;
  userId: string;
  userName: string;
}

// ── Voice Analytics ──

export interface SelfDiagnosisResponse {
  ok: boolean;
  data: {
    result: SelfDiagnosisResultData;
    analysisDays: number;
    isCooldownEnabled: boolean;
    cooldownHours: number;
  } | null;
  reason?: 'not_enabled' | 'cooldown' | 'quota_exhausted';
  remainingSeconds?: number;
}

export interface SelfDiagnosisResultData {
  totalMinutes: number;
  activeDays: number;
  totalDays: number;
  activeDaysRatio: number;
  avgDailyMinutes: number;
  activityRank: number;
  activityTotalUsers: number;
  activityTopPercent: number;
  peerCount: number;
  hhiScore: number;
  topPeers: Array<{ userId: string; userName: string; minutes: number; ratio: number }>;
  hasMocoActivity: boolean;
  mocoScore: number;
  mocoRank: number;
  mocoTotalUsers: number;
  mocoTopPercent: number;
  mocoHelpedNewbies: number;
  micUsageRate: number;
  aloneRatio: number;
  verdicts: Array<{
    category: VerdictCategory;
    categoryCode?: VerdictCategoryCode;
    isPassed: boolean;
    criterion: string;
    actual: string;
    actualValue?: number;
    actualUnit?: VerdictUnit;
    criterionCode?: VerdictCriterionCode;
    criterionParams?: Record<string, number>;
  }>;
  badges: string[];
  badgeGuides: Array<{
    code: string;
    name: string;
    icon: string;
    isEarned: boolean;
    criterion: string;
    current: string;
    criterionCode?: BadgeCriterionCode;
    criterionParams?: Record<string, number>;
    currentCode?: BadgeCurrentCode;
    currentParams?: Record<string, string | number>;
  }>;
  llmSummary?: string;
}

export interface LlmSummaryResponse {
  ok: boolean;
  data: { llmSummary: string } | null;
  reason?: 'quota_exhausted';
}

/** 베스트 프렌드 집계 허용 기간(일) */
export type ValidBestFriendPeriod = 7 | 30 | 90;

/**
 * Bot ↔ API 캔버스 PNG 응답 공통 형식.
 * /me, /best-friend 모두 동일한 응답 셰이프를 사용한다.
 * `ok: false`는 서버 렌더 실패 등 비정상 상황을, `ok: true, data: null`은
 * 정상 처리됐으나 표시할 데이터가 없는 상황(예: 최근 활동 없음)을 의미한다.
 */
export interface CanvasCardResponse {
  ok: boolean;
  data: { imageBase64: string } | null;
  days: number;
}

// 기존 MeProfileResponse를 CanvasCardResponse 별칭으로 치환 (하위 호환 유지)
export type MeProfileResponse = CanvasCardResponse;

export type BestFriendCardResponse = CanvasCardResponse;

/** 카드 내 텍스트 로케일 (봇 인터랙션 locale 기반, 미지원 값은 'en'으로 처리) */
export type CanvasCardLocale = 'ko' | 'en';

/** getMyBestFriends 요청 옵션 */
export interface GetMyBestFriendsOptions {
  guildId: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
  period: ValidBestFriendPeriod;
  limit: number;
  locale: CanvasCardLocale;
}

// ── Voice Sync (봇 시작 시 기존 음성 채널 사용자 동기화) ──

export interface VoiceSyncUser {
  userId: string;
  channelId: string;
  channelName: string;
  parentCategoryId: string | null;
  categoryName: string | null;
  userName: string;
  avatarUrl: string | null;
  micOn: boolean;
  streaming: boolean;
  selfVideo: boolean;
  selfDeaf: boolean;
  gameName: string | null;
  gameApplicationId: string | null;
}

export interface VoiceSyncDto {
  guildId: string;
  users: VoiceSyncUser[];
}

// ── Voice User Count ──

export interface GuildVoiceUserCount {
  guildId: string;
  count: number;
}

// ── Co-Presence ──

export interface CoPresenceSnapshot {
  guildId: string;
  channelId: string;
  userIds: string[];
  /** Phase 2: 멤버별 게임 활동 정보 (optional, 하위 호환) */
  memberActivities?: CoPresenceMemberActivity[];
}

export interface CoPresenceMemberActivity {
  userId: string;
  gameName: string | null;
  applicationId: string | null;
}

// ── Moco Canvas ──

export interface MocoRankEmbedResponse {
  mode: 'EMBED';
  embeds: Record<string, unknown>[];
  components: Record<string, unknown>[];
}

export interface MocoRankCanvasResponse {
  mode: 'CANVAS';
  imageBase64: string;
  components: Record<string, unknown>[];
}

export type MocoRankResponse = MocoRankEmbedResponse | MocoRankCanvasResponse;

export interface MocoMyEmbedResponse {
  ok: boolean;
  mode: 'EMBED';
  data: string;
}

export interface MocoMyCanvasResponse {
  ok: boolean;
  mode: 'CANVAS';
  imageBase64: string;
}

export type MocoMyResponse = MocoMyEmbedResponse | MocoMyCanvasResponse;

// ── Mission My Progress (A4) ──

/** apps/api의 MissionStatus enum과 값 동일 — 패키지 경계상 리터럴 유니언으로 복제(의존 방향 유지) */
export type MissionMyProgressStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'LEFT';

export interface MissionMyProgress {
  status: MissionMyProgressStatus;
  playtimeSec: number;
  playCount: number;
  targetPlaytimeSec: number;
  targetPlayCount: number | null;
  endDate: string;
  daysLeft: number;
}

export type MissionMyResponse =
  | { ok: true; hasMission: false }
  | { ok: true; hasMission: true; data: MissionMyProgress };

// ── Guild Member ──

export interface GuildMemberUpsertDto {
  guildId: string;
  userId: string;
  displayName: string;
  username: string;
  nick: string | null;
  avatarUrl: string | null;
  isBot: boolean;
  joinedAt: string | null; // ISO 8601
}

export interface GuildMemberBulkUpsertDto {
  guildId: string;
  members: GuildMemberUpsertDto[];
}

export interface GuildMemberDeactivateDto {
  guildId: string;
  userId: string;
}

export interface GuildMemberUserUpdateDto {
  userId: string;
  /** discord globalName ?? username — Bot 측에서 변환하여 전달 */
  displayName: string;
  username: string;
}

// ── Role Panel ──

export interface BotRolePanelConfigDto {
  panelId: number;
  buttons: Array<{
    buttonId: number;
    roleId: string;
    mode: 'GRANT' | 'TOGGLE';
  }>;
}

// ── Common ──

export interface BotApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
