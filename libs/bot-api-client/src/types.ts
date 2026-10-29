import type {
  AdminAssistRecommendResponse,
  AutoActionRecordDto,
  CommandUsedDto,
  GuildLifecycleEventDto,
  LeaderboardDeniedReason,
  MeRecapBotResponse,
  MessageCode,
  NewbieOnboardingFailureDto,
  SupportedLocale,
} from '@onyu/shared';

export type {
  AutoActionRecordDto,
  CommandUsedDto,
  GuildLifecycleEventDto,
  MeRecapBotResponse,
  NewbieOnboardingFailureDto,
};

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

  /** 관리자 강제 마이크 음소거(F-VOICE-099/100). 구버전 봇은 미전송 → undefined */
  serverMute?: boolean;
  /** 관리자 강제 스피커 음소거(F-VOICE-099/100). 구버전 봇은 미전송 → undefined */
  serverDeaf?: boolean;

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
  /** F-NEWBIE-001-CANVAS. 구 캐시(컬럼 추가 전 저장분)는 undefined일 수 있다 — 봇은 `=== 'CANVAS'` 양성 비교로 안전 처리한다(D10) */
  welcomeDisplayMode: 'EMBED' | 'CANVAS';
  welcomeEmbedTitle: string | null;
  welcomeEmbedDescription: string | null;
  welcomeEmbedColor: string | null;
  welcomeEmbedThumbnailUrl: string | null;
  missionEnabled: boolean;
  /** F-NEWBIE-009 — 환영 템플릿 미션 변수 치환용(계획 §S1-1). NULL/미설정이면 해당 변수는 빈 문자열로 치환된다. */
  missionTargetPlaytimeHours: number | null;
  /** F-NEWBIE-009 — 상동. */
  missionTargetPlayCount: number | null;
  /** F-NEWBIE-009 — 상동. */
  missionDurationDays: number | null;
  /** F-NEWBIE-009 — 상동(`{missionChannel}` 멘션 조립용). */
  missionNotifyChannelId: string | null;
  roleEnabled: boolean;
  newbieRoleId: string | null;
  roleDurationDays: number | null;
}

/** GET /bot-api/newbie/welcome-card 응답 (E4). CanvasCardResponse와 셰이프가 달라 별도 선언 */
export interface WelcomeCardResponse {
  ok: true;
  imageBase64: string;
}

/** getWelcomeCard 요청 옵션(E4) */
export interface GetWelcomeCardOptions {
  guildId: string;
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  memberCount: number;
  serverName: string;
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
  /**
   * 신규(F-VOICE-125·auto-channel-name-input §3-3) — `action='show_sub_options'`일 때만
   * 채워진다. 봇이 `auto_sub` customId(§3-1)에 실을 모드. 구 API(필드 미전송)와의 하위호환을
   * 위해 optional — 봇은 `result.nameInputMode ?? 'off'`로 폴백해 사용한다.
   */
  nameInputMode?: 'off' | 'optional' | 'required';
}

// ── Auto Channel 방제 자유 입력 (F-VOICE-125~133, auto-channel-name-input) ──

/** POST /bot-api/auto-channel/name-submit 요청 (모달 제출 → 서버 재검증). */
export interface AutoChannelNameSubmitDto {
  guildId: string;
  userId: string;
  displayName: string;
  voiceChannelId: string | null;
  /** 봇이 항상 `?? ''`로 정규화해 보낸다(null 금지 — API DTO가 null을 거부한다) */
  userInput: string;
  /** buttonId / subOptionId 중 정확히 하나만 채운다(둘 다/둘 다 없음은 서버가 error로 처리) */
  buttonId?: number;
  subOptionId?: number;
}

/** POST /bot-api/auto-channel/name-submit 응답 — `AutoChannelButtonResult`와 별개 타입(D-6, `show_sub_options` 없음). */
export interface AutoChannelNameSubmitResult {
  action: 'created' | 'validation_error' | 'error';
  channelId?: string;
  channelName?: string;
  message: string;
  code?: MessageCode;
  params?: Record<string, string | number>;
}

/**
 * GET /bot-api/auto-channel/name-input 요청. 🔒 `buttonId`는 N1(`AutoChannelNameSubmitDto`)과
 * 달리 **항상 필수**다 — N3는 하위 선택지 클릭 시에도 소속 버튼 ID를 함께 요구한다
 * (endpoint-spec §12-2b-2). 혼동 주의.
 */
export interface AutoChannelNameInputQuery {
  buttonId: number;
  subOptionId?: number;
  locale?: SupportedLocale;
  /** 버튼이 이 길드 소속인지 API 가 대조한다(누락 시 400, 불일치 시 404) */
  guildId: string;
}

/** GET /bot-api/auto-channel/name-input 응답 — 모달 사양(Discord showModal 전 조회). */
export interface AutoChannelNameInputSpec {
  /** 'off'는 이 타입에 없다 — 서버가 404(ERR_AUTO_CHANNEL_NAME_INPUT_DISABLED)로 응답한다 */
  mode: 'optional' | 'required';
  templatePreview: string;
  minLength: number;
  maxLength: number;
  placeholder: string;
  /** 1차 미전송(D-6) — 계약 필드는 미래 확장 여지로 유지 */
  label?: string;
}

// ── Sticky Message ──

export interface MessageCreatedDto {
  guildId: string;
  channelId: string;
  /** 🟨 전환기 optional — sticky-pin 무한루프 판정(F-STICKY-011)에 사용. 구버전 봇은 미전송 가능 */
  messageId?: string;
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
export type CanvasCardLocale = SupportedLocale;

/**
 * 활동 상세(F-VOICE-064) 응답 소스별 섹션 셰이프 — endpoint-spec §7-1.
 * 활동 없음 → `null` · 조회 실패 → `{ error: true }`.
 */
export type ActivityDetailSection<T> =
  | (T & { rank: number; totalUsers: number; upPercent: number })
  | null
  | { error: true };

/** 활동 상세 음성 채널 TOP 항목 (F-VOICE-064 R7) */
export interface ActivityDetailVoiceChannel {
  channelName: string;
  durationSec: number;
}

/** 활동 상세 메시지 채널 TOP 항목 (F-VOICE-064 R7) */
export interface ActivityDetailMessageChannel {
  channelName: string;
  messageCount: number;
}

/** POST /bot-api/me/activity-detail 응답 (R1, F-VOICE-064 · R7 채널 TOP3/파생 통계 확장) */
export interface MeActivityDetailResponse {
  ok: boolean;
  days: number;
  data: {
    voice: ActivityDetailSection<{
      totalSec: number;
      /** durationSec 내림차순 최대 3건. 활동 채널 3개 미만이면 있는 만큼만 */
      channels: ActivityDetailVoiceChannel[];
      activeDays: number;
      avgDailySec: number;
      /** 마이크 사용률 % (소수 1자리) */
      micUsageRate: number;
    }>;
    message: ActivityDetailSection<{
      totalCount: number;
      /** messageCount 내림차순 최대 3건 */
      channels: ActivityDetailMessageChannel[];
    }>;
  };
}

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

/**
 * getDuoChemistry 요청 옵션(F-COPRESENCE-029) — API `DuoChemistryRequestDto`와 수기 정합 필수.
 * 🔒 불변식(계획 §2-F): `userId`는 언제나 커맨드 실행자(`interaction.user.id`)다. `상대`
 * 옵션값은 `peerId`로만 전달하며, 어떤 분기에서도 두 필드가 뒤바뀌어선 안 된다.
 */
export interface GetDuoChemistryOptions {
  guildId: string;
  userId: string;
  peerId: string;
  selfDisplayName: string;
  selfAvatarUrl: string;
  peerDisplayName: string;
  peerAvatarUrl: string;
  locale: CanvasCardLocale;
}

/** POST /bot-api/co-presence/duo 응답 — 기존 CanvasCardResponse와 동일 셰이프(신규 타입 아님) */
export type DuoChemistryCardResponse = CanvasCardResponse;

/** checkDuoEligibility 요청 옵션(B3) — API 듀오 eligibility DTO 와 수기 정합 필수 */
export interface CheckDuoEligibilityOptions {
  guildId: string;
  /** 🔒 커맨드 실행자(버튼 클릭자) */
  userId: string;
  peerId: string;
}

/** POST /bot-api/co-presence/duo/eligibility 응답 — `ok:false` 는 provider 실패(fail-closed 대상) */
export interface DuoEligibilityResponse {
  ok: boolean;
}

/** getMeProfile 요청 옵션(R3, F-VOICE-082) — API `MeProfileRequestDto`와 수기 정합 필수 */
export interface GetMeProfileOptions {
  guildId: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
  viewOption?: 'level' | 'voice';
  locale: CanvasCardLocale;
  /** `/미 멘트` 옵션(F-VOICE-079 R3.5). 미지정 시 멘트 파이프라인 미진입 */
  mentType?: 'analysis';
}

/** getRecapCard 요청 옵션(B1, 연말 결산) — API `MeRecapRequestDto`와 수기 정합 필수 */
export interface GetRecapCardOptions {
  guildId: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
  locale?: CanvasCardLocale;
}

// ── Level (Rank / Leaderboard Cards, U9) ──

/**
 * getLevelRankCard 요청 옵션(F-LVL-24/25, U9) — API `RankCardRequestDto`(endpoint-spec §5-9)와
 * 수기 정합 필수. 닉네임·아바타 URL 등 개인정보가 액세스 로그(query string)에 남지 않도록 POST
 * body로 전송한다(`getMeProfile`/`getDuoChemistry` 관례 — endpoint-spec §3-A 근거).
 * 🔒 `userId`는 조회 **대상**이다(요청자가 아니다 — `GetDuoChemistryOptions.userId`=실행자
 * 불변식과 반대이므로 혼동 주의).
 */
export interface GetLevelRankCardOptions {
  guildId: string;
  userId: string;
  displayName: string;
  avatarUrl: string;
  locale: CanvasCardLocale;
  /**
   * 커맨드 실행자(조회 대상 `userId`와 다를 수 있다). 본인 예외 판정 근거(U10, F-LVL-27).
   * 🔒 **optional — required(400)로 두지 않는다.** api·봇이 별도 컨테이너로 순차 배포되므로
   * api가 먼저 배포되고 이 필드를 필수로 만들면 롤아웃 창 동안 `/rank`가 전 길드 400으로
   * 전멸한다(D5). 미전송 시 서버가 본인 예외 없이 처리한다(안전한 fail-safe).
   */
  requesterUserId?: string;
  /**
   * 요청자의 길드 관리자 여부(봇이 `interaction.memberPermissions?.any([Administrator,
   * ManageGuild])`로 판정). 🔒 **optional** — 미전송 시 서버가 `false`(fail-closed 방향, U10 D5)로
   * 간주한다. 마이그레이션 기본값이 `'GUILD_MEMBER'`라 배포 직후 `ADMIN_ONLY` 길드가 0개이므로
   * 실질 영향이 없다.
   */
  requesterIsGuildAdmin?: boolean;
}

/**
 * POST /bot-api/level/rank-card 응답(endpoint-spec §5-10). `CanvasCardResponse`를 재사용하지
 * 않는다 — `days`(집계 기간) 필드가 누적 전체 기준인 레벨 카드에는 의미가 없고 `0`을 넣으면
 * 기존 `xxxNoData{days}` 류 문구 관례와 충돌한다(`WelcomeCardResponse`와 동일한 편차 사유).
 */
export interface LevelRankCardResponse {
  /** false = 렌더 실패(5xx 아님 — 항상 200으로 온다) */
  ok: boolean;
  /** null = 데이터 없음 · 레벨 비활성 · 가시성 거부 · 렌더 실패(사유를 구분하지 않는다) */
  data: { imageBase64: string } | null;
  /** ✅ U10 신규 — 가시성 판정 통과 여부. `false` = `ADMIN_ONLY` 설정에 의한 거부 */
  visible: boolean;
  /** ✅ U10 신규 — 거부 사유 코드. `visible=true`면 `null` */
  deniedReason: LeaderboardDeniedReason | null;
}

/**
 * getLevelLeaderboardCard 요청 옵션(F-LVL-26, U9) — API `LeaderboardCardRequestDto`
 * (endpoint-spec §5-9)와 수기 정합 필수. `/랭킹` 커맨드 · 이전/다음 페이지 버튼 · `/me`
 * [서버 리더보드] 버튼 3개 진입점이 이 메서드 하나로 수렴한다.
 */
export interface GetLevelLeaderboardCardOptions {
  guildId: string;
  /** 1-base. 미지정 시 API 기본값 1 */
  page?: number;
  /** 미지정 시 API 기본값 10, API가 상한 25로 clamp */
  limit?: number;
  /** 본인 행 하이라이트 판정 대상. 미지정 시 하이라이트 없이 정상 렌더 */
  viewerUserId?: string;
  locale: CanvasCardLocale;
  /**
   * 커맨드 실행자/버튼 클릭자. 익명화 본인 예외 판정 근거(U10, F-LVL-27·28).
   * 🔒 **optional** — 미전송 시 `viewerUserId`로 폴백(구 봇도 이미 전송 중이라 롤아웃 창에서도
   * 본인 예외가 유지된다, D5).
   */
  requesterUserId?: string;
  /** 요청자의 길드 관리자 여부. 🔒 **optional** — 미전송 시 `false`(fail-closed, U10 D5) */
  requesterIsGuildAdmin?: boolean;
}

/**
 * POST /bot-api/level/leaderboard-card 응답(endpoint-spec §5-10). 이전/다음 버튼 활성 판정에
 * `page`/`totalPages`가 반드시 필요해 `CanvasCardResponse` 재사용이 애초에 불가능하다.
 */
export interface LevelLeaderboardCardResponse {
  /** false = 렌더 실패(5xx 아님 — 항상 200으로 온다) */
  ok: boolean;
  /** null = 데이터 없음 · 레벨 비활성 · 가시성 거부 · 범위 초과 페이지 · 렌더 실패 */
  data: { imageBase64: string } | null;
  /** level_config.isEnabled (행 부재 시 true). 비활성/활동없음 문구 분기 근거 */
  isEnabled: boolean;
  /** 요청 page 에코 */
  page: number;
  /** max(1, ceil(total/limit)) — 이전/다음 버튼 활성/비활성 판정 */
  totalPages: number;
  /** 봇 제외·퇴장 제외·U10 No-XP 역할 제외 후 전체 유효 인원 */
  total: number;
  /** ✅ U10 신규 — 가시성 판정 통과 여부 */
  visible: boolean;
  /** ✅ U10 신규 — 거부 사유 코드. `visible=true`면 `null` */
  deniedReason: LeaderboardDeniedReason | null;
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
  /** 관리자 강제 마이크 음소거(F-VOICE-099/100). 구버전 봇은 미전송 → undefined */
  serverMute?: boolean;
  /** 관리자 강제 스피커 음소거(F-VOICE-099/100). 구버전 봇은 미전송 → undefined */
  serverDeaf?: boolean;
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
  /** 카테고리 단위 제외 채널 매칭용 부모 카테고리 ID (optional, 하위 호환 — 구버전 봇은 미전송) */
  parentCategoryId?: string | null;
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
  /** 종결(COMPLETED/FAILED) 미션은 null */
  daysLeft: number | null;
  /** IN_PROGRESS 이면 true, 최신 종결 미션 폴백이면 false */
  isCurrent: boolean;
  /** ISO 8601. COMPLETED + 완료 시각이 기록된 전이분만 값 */
  completedAt: string | null;
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

/**
 * bulk sync 직후 "이번에 확인된 재적자 집합 밖" 의 기존 활성 행을 비활성화(soft delete)하기 위한
 * 요청. `activeUserIds`는 봇이 `guild.members.fetch()`로 **전량 확보에 성공했을 때만** 채워
 * 보내야 한다 — 부분 목록으로 호출하면 재적자를 대량 오탐 비활성화할 수 있다. 최종 안전 가드
 * (빈 집합/과도한 비율)는 API 측이 판단한다(GuildMemberReconcileResult 참조).
 */
export interface GuildMemberReconcileDto {
  guildId: string;
  activeUserIds: string[];
  /**
   * 멤버 fetch 시작 시각(ISO 8601). 이 시각 이후 갱신된 행(fetch 도중 입장자)은 API 가
   * 비활성화하지 않는다. optional — 미전송 시 종전 동작(구버전 호환).
   */
  snapshotAt?: string;
}

/** POST /bot-api/guild-member/reconcile 응답. `skipped=true`이면 안전 가드에 의해 비활성화가 수행되지 않았다. */
export interface GuildMemberReconcileResult {
  ok: boolean;
  deactivated: number;
  skipped: boolean;
  skipReason?: 'empty-active-set' | 'ratio-exceeded' | 'error';
}

// ── Guild Directory ──

/** 봇이 실제 참여 중인 길드 1개의 스냅샷(F-SUPER-ADMIN-039). icon 미설정 길드는 null. */
export interface GuildDirectoryReconcileGuild {
  id: string;
  name: string | null;
  icon: string | null;
}

/**
 * 봇 clientReady 시 실제 참여 중인 길드 전체 목록으로 guild_directory를 정정하기 위한 요청.
 * 목록 밖 기존 isBotActive=true 행을 비활성화 후보로 삼는다 — 안전 가드는
 * {@link GuildDirectoryReconcileResult} 참조.
 */
export interface GuildDirectoryReconcileDto {
  guilds: GuildDirectoryReconcileGuild[];
}

/** POST /bot-api/super-admin/guild-directory/reconcile 응답. `skipped=true`면 안전 가드에 의해 비활성화가 수행되지 않았다. */
export interface GuildDirectoryReconcileResult {
  ok: boolean;
  upserted: number;
  deactivated: number;
  skipped: boolean;
  skipReason?: 'empty-guild-list' | 'ratio-exceeded' | 'error';
}

// ── Guild Role ──

/**
 * 전량 스냅샷·증분 upsert 공통 역할 payload. `syncedAt`은 API가 `now()`로 세팅한다(봇 시계
 * 미신뢰). `hasTags`(2026-08-31 Q1 확정)는 `role.tags != null` 여부 — DB 소스로 전환된
 * `LevelRoleValidator` 기준3(managed/tags 판정)의 동등성을 보존하기 위한 필드다(EC-GR-35).
 */
export interface GuildRolePayload {
  roleId: string;
  name: string;
  permissions: string; // Discord 권한 bitfield 10진 문자열 — DB CHECK(^[0-9]+$)와 짝
  color: number;
  position: number;
  hoist: boolean;
  mentionable: boolean;
  isManaged: boolean;
  hasTags: boolean;
  memberCount: number;
}

/**
 * 길드 단위 전량 스냅샷. `roles`는 봇이 `guild.roles.fetch()`로 **전량 확보에 성공했을 때만**
 * 채워 보내야 한다 — 부분 목록으로 호출하면 살아있는 역할이 대량 DELETED로 오탐 마킹된다.
 * 최종 안전 가드(빈 집합/50% 초과 비율)는 API 측이 판단한다({@link GuildRoleSyncResult} 참조).
 */
export interface GuildRoleSyncDto {
  guildId: string;
  roles: GuildRolePayload[];
}

/** POST /bot-api/guild-role/sync 응답. `skipped=true`면 안전 가드로 DELETED 마킹이 수행되지 않았다. */
export interface GuildRoleSyncResult {
  ok: boolean;
  upserted: number;
  markedDeleted: number;
  skipped: boolean;
  skipReason?: 'empty-role-set' | 'ratio-exceeded' | 'error';
}

/**
 * POST /bot-api/guild-role/upsert · /mark-deleted 공통 응답. `ok:false`는 호출측(봇 이벤트
 * 핸들러)이 해당 길드 전량 재스냅샷 1회를 트리거하는 조건이다(F-GUILD-ROLE-011).
 */
export interface GuildRoleMutationResult {
  ok: boolean;
}

export interface GuildRoleUpsertDto extends GuildRolePayload {
  guildId: string;
}

export interface GuildRoleMarkDeletedDto {
  guildId: string;
  roleId: string;
}

export interface GuildRolePurgeDto {
  guildId: string;
}

/** POST /bot-api/guild-role/purge-guild 응답. 하드 삭제라 사후 검증용으로 삭제 행 수를 함께 준다. */
export interface GuildRolePurgeResult {
  ok: boolean;
  deleted: number;
}

// ── Role Panel ──

export interface BotRolePanelConfigDto {
  panelId: number;
  buttons: Array<{
    buttonId: number;
    roleIds: string[];
    mode: 'GRANT' | 'TOGGLE' | 'EXCLUSIVE';
    exclusiveGroupKey: string | null;
    localeTag: SupportedLocale | null;
  }>;
}

// ── Locale ──

/** GET /bot-api/locale/user/:userId 응답 — 🔒 `?? 'en'` 폴백 없음 */
export interface UserLocaleResponse {
  locale: SupportedLocale | null;
}

// ── Common ──

export interface BotApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ── Admin Assist (E8, F-ADMIN-ASSIST-078~081, M4/A2 봇 read-only 진입점) ──

/**
 * getAdminAssistRecommendation 요청 옵션 — API `BotAdminAssistRecommendDto`(endpoint-spec
 * §5E-2)와 수기 정합 필수. `source`·`surface`·`parentHistoryId`·`requesterIsGuildAdmin` 은
 * 두지 않는다 — API 가 상수로 고정하거나(source/surface) 봇 표면 비범위(parentHistoryId)이거나
 * 검증 불가한 필드라 계약에서 뺐다(requesterIsGuildAdmin).
 */
export interface GetAdminAssistRecommendationOptions {
  guildId: string;
  /** 🔒 언제나 커맨드 실행자(`interaction.user.id`) — 조회 대상이 아니다 */
  userId: string;
  queryText: string;
  locale?: SupportedLocale;
  /** 🟨 1차 구현은 봇이 전송하지 않는다(endpoint-spec §5E-2 — 길드 전체가 읽는 글에 실행자 1인 로케일을 강제하지 않기 위함) */
  writeLocale?: SupportedLocale;
}

/**
 * getAdminAssistRecommendation 반환 — 판별 가능한 결과(endpoint-spec §5E-6 🟨 권고안 ⓐ).
 * "쿼터 소진"(정상·예상된 결과)과 "장애"가 커맨드 핸들러에서 `catch` 안 문자열 매칭으로
 * 판별되지 않도록 SDK 가 axios 에러 해석을 이 메서드 안에 가둔다.
 */
export type AdminAssistRecommendationResult =
  | { ok: true; data: AdminAssistRecommendResponse }
  | { ok: false; reason: 'quota_exhausted' }
  | { ok: false; reason: 'error' };

// ── Health (U9a-2 F-SUPER-ADMIN-016) ──

/** Bot → API 헬스 스냅샷 push payload. `@onyu/shared`의 `BotHealthSnapshot`과 동형. */
export interface BotHealthSnapshotDto {
  gatewayPing: number;
  guildCount: number;
  voiceUsersTotal: number;
  uptimeSeconds: number;
  /** 상주 메모리(RSS) — bytes, 정수 */
  rssBytes: number;
  /** V8 heap 사용량 — bytes, 정수 */
  heapUsedBytes: number;
  /** 직전 샘플 대비 CPU 사용률(%) — 단일 코어 100% 기준, 소수 1자리 */
  cpuPercent: number;
}

// ── Settings Auto Action (F-WEB-043 / F-VOICE-144) ──

/** Bot → API 채널 삭제 사실 통지 payload. 채널 이름은 포함하지 않는다(EC-WEBA-26). */
export interface SettingsChannelDeletedDto {
  guildId: string;
  channelId: string;
}
