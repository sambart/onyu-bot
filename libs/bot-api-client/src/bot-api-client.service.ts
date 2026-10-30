import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import type {
  AdminAssistRecommendResponse,
  LevelLeaderboardResponse,
  SupportedLocale,
} from '@onyu/shared';
import { ADMIN_ASSIST_RECOMMEND_TIMEOUT_MS, MESSAGE_CODE } from '@onyu/shared';
import type { AxiosRequestConfig } from 'axios';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { isNotFoundApiError } from './api-error';
import { buildBotApiFailureReport } from './request-failure-log';
import type {
  AdminAssistRecommendationResult,
  AutoActionRecordDto,
  AutoChannelButtonClickDto,
  AutoChannelButtonResult,
  AutoChannelNameInputQuery,
  AutoChannelNameInputSpec,
  AutoChannelNameSubmitDto,
  AutoChannelNameSubmitResult,
  AutoChannelSubOptionDto,
  BestFriendCardResponse,
  BotApiResponse,
  BotHealthSnapshotDto,
  BotRolePanelConfigDto,
  CheckDuoEligibilityOptions,
  CommandUsedDto,
  CoPresenceSnapshot,
  DuoChemistryCardResponse,
  DuoEligibilityResponse,
  GetAdminAssistRecommendationOptions,
  GetBadgeCollectionCardOptions,
  GetDuoChemistryOptions,
  GetLevelLeaderboardCardOptions,
  GetLevelRankCardOptions,
  GetMeProfileOptions,
  GetMyBestFriendsOptions,
  GetRecapCardOptions,
  GetWelcomeCardOptions,
  GuildDirectoryReconcileDto,
  GuildDirectoryReconcileResult,
  GuildLifecycleEventDto,
  GuildMemberBulkUpsertDto,
  GuildMemberDeactivateDto,
  GuildMemberReconcileDto,
  GuildMemberReconcileResult,
  GuildMemberUpsertDto,
  GuildMemberUserUpdateDto,
  GuildRoleMarkDeletedDto,
  GuildRoleMutationResult,
  GuildRolePurgeDto,
  GuildRolePurgeResult,
  GuildRoleSyncDto,
  GuildRoleSyncResult,
  GuildRoleUpsertDto,
  GuildVoiceUserCount,
  LevelLeaderboardCardResponse,
  LevelRankCardResponse,
  MeActivityDetailResponse,
  MeBadgesBotResponse,
  MemberJoinDto,
  MeProfileResponse,
  MeRecapBotResponse,
  MessageCountedDto,
  MessageCreatedDto,
  MissionMyResponse,
  MissionRefreshDto,
  MocoMyResponse,
  MocoRankResponse,
  NewbieConfigDto,
  NewbieOnboardingFailureDto,
  RoleAssignedDto,
  SettingsChannelDeletedDto,
  StatusPrefixApplyDto,
  StatusPrefixApplyResult,
  StatusPrefixResetDto,
  StatusPrefixResetResult,
  StickyMessageConfigItem,
  UserLocaleResponse,
  VoiceStateUpdateDto,
  VoiceSyncDto,
  WelcomeCardResponse,
} from './types';

/**
 * 멘트 포함 `/me` 요청 per-request 타임아웃(F-VOICE-079 R3.5) — LLM 단위 8초 + 카드
 * 조회/렌더 여유. 전역 타임아웃(10s)은 무옵션 경로에서 불변이다(PRD 명시).
 */
const ME_PROFILE_MENT_TIMEOUT_MS = 20_000;

/** N3 는 interaction 3초 데드라인 안에서 showModal 전에 호출된다 — 전역 10s 를 쓰면 데드라인을 넘긴다 */
const AUTO_CHANNEL_NAME_INPUT_TIMEOUT_MS = 1_500;

/**
 * showModal 경로(N3)에서 dispatch 전 `localeResolver.resolve()` 가 이 메서드를 먼저 await 한다
 * (EC-ACNI-35·51 문서는 N3 만 3초 예산에 넣었으나, 실제로는 locale 왕복도 같은 예산을 쓴다).
 * 전역 10s 를 쓰면 N3 의 1.5s 예산과 무관하게 이 호출만으로 데드라인을 넘길 수 있다.
 * 실패는 `LocaleResolverService.resolve()` 가 흡수하고 `interaction.locale` 로 폴백하므로
 * per-request 타임아웃으로 짧게 끊어도 안전하다.
 */
const USER_LOCALE_TIMEOUT_MS = 1_000;

/**
 * newbie config 조회 per-request 타임아웃. 입장 이벤트 경로의 재시도(최대 3회 시도)가 전역 10s 로
 * 누적돼 수십 초 지연되지 않도록 짧게 끊는다. 실패는 호출부가 재시도·실패 기록으로 흡수한다.
 */
const NEWBIE_CONFIG_TIMEOUT_MS = 3_000;

/** admin-assist 쿼터 소진 응답(§5E-6) HTTP 상태 코드 — `bot-newbie-interaction.handler.ts` 관례 */
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;

/** 듀오 상대 표시 거부 400 판별용 HTTP 상태 코드 */
const HTTP_STATUS_BAD_REQUEST = 400;

/**
 * 듀오 케미 API 가 상대의 표시 거부(F-COPRESENCE-035)로 거절한 400 인지 판별한다.
 * `getDuoChemistry`/`checkDuoEligibility` 의 throw 동작은 그대로 두고, 호출측 catch 에서 이 헬퍼로 분기한다.
 * `AllExceptionsFilter` 가 `code` 를 최상위로 승격하지만 봉투 변화에 견고하도록 `message.code` 도 허용한다.
 */
export function isDuoPeerHiddenError(error: unknown): boolean {
  if (!isAxiosError(error) || error.response?.status !== HTTP_STATUS_BAD_REQUEST) {
    return false;
  }
  const data: unknown = error.response.data;
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  // as 단언 사유: axios 에러 바디는 unknown 이라 `code` 후보 두 위치를 얕게 조회하는 구조 단언이 필요하다.
  const envelope = data as { code?: unknown; message?: unknown };
  if (envelope.code === MESSAGE_CODE.CO_PRESENCE_PEER_HIDDEN) {
    return true;
  }
  if (typeof envelope.message === 'object' && envelope.message !== null) {
    return (envelope.message as { code?: unknown }).code === MESSAGE_CODE.CO_PRESENCE_PEER_HIDDEN;
  }
  return false;
}

/**
 * Bot → API HTTP 클라이언트.
 * API_BASE_URL과 BOT_API_KEY를 환경 변수에서 읽어 자동으로 인증 헤더를 추가한다.
 */
@Injectable()
export class BotApiClientService {
  private readonly logger = new Logger(BotApiClientService.name);

  constructor(private readonly http: HttpService) {}

  // ── Voice ──

  async sendVoiceStateUpdate(dto: VoiceStateUpdateDto): Promise<void> {
    await this.post('/bot-api/voice/state-update', dto);
  }

  async pushVoiceSync(dto: VoiceSyncDto): Promise<void> {
    await this.post('/bot-api/voice/sync', dto);
  }

  // ── Newbie ──

  async sendMemberJoin(dto: MemberJoinDto): Promise<void> {
    await this.post('/bot-api/newbie/member-join', dto);
  }

  async refreshMissionEmbed(dto: MissionRefreshDto): Promise<void> {
    await this.post('/bot-api/newbie/mission-refresh', dto);
  }

  async getMocoRankData(guildId: string, page: number): Promise<MocoRankResponse> {
    return this.get(`/bot-api/newbie/moco-rank?guildId=${guildId}&page=${page}`);
  }

  async getMyHuntingData(guildId: string, userId: string): Promise<MocoMyResponse> {
    return this.get(`/bot-api/newbie/moco-my?guildId=${guildId}&userId=${userId}`);
  }

  /** A4: "내 진행도" 셀프 조회 (F-NEWBIE-002). moco-my와 대칭. */
  async getMyMissionData(guildId: string, memberId: string): Promise<MissionMyResponse> {
    return this.get(`/bot-api/newbie/mission-my?guildId=${guildId}&memberId=${memberId}`);
  }

  /**
   * 길드 newbie 설정을 조회한다.
   * - 미설정(응답 data null 또는 404) → `null` (장애가 아니다)
   * - 5xx·타임아웃·네트워크·401 등 그 외 실패 → throw (호출부가 일시 실패를 재시도·기록한다 — 감사 A5/D3)
   * 실패 로그는 공통 `logReqFailure` 가 이미 남기므로 여기서 중복 로깅하지 않는다.
   */
  async getNewbieConfig(guildId: string): Promise<NewbieConfigDto | null> {
    try {
      const response = await this.get<BotApiResponse<NewbieConfigDto>>(
        `/bot-api/newbie/config?guildId=${guildId}`,
        { timeout: NEWBIE_CONFIG_TIMEOUT_MS },
      );
      return response.data ?? null;
    } catch (err) {
      if (isNotFoundApiError(err)) return null;
      throw err;
    }
  }

  async notifyRoleAssigned(dto: RoleAssignedDto): Promise<void> {
    await this.post('/bot-api/newbie/role-assigned', dto);
  }

  /**
   * F-ADMIN-LOG-006 — 신입 온보딩 실패(환영 메시지/역할 부여)를 관리 로그 채널 게시용으로
   * 수집한다. `recordAutoAction()` 관례대로 호출측은 반드시 fire-and-forget으로 호출한다.
   */
  async recordNewbieOnboardingFailure(dto: NewbieOnboardingFailureDto): Promise<void> {
    await this.post('/bot-api/newbie/onboarding-failure', dto);
  }

  /** F-NEWBIE-001-CANVAS — 환영 카드 PNG 렌더 요청(E4). 실패는 그대로 throw해 호출부가 EMBED로 강등한다 */
  async getWelcomeCard(options: GetWelcomeCardOptions): Promise<WelcomeCardResponse> {
    // 한글 닉네임/서버명이 그대로 들어가므로 URLSearchParams로 인코딩한다(템플릿 리터럴 직결 금지)
    const params = new URLSearchParams({
      guildId: options.guildId,
      memberId: options.memberId,
      displayName: options.displayName,
      memberCount: String(options.memberCount),
      serverName: options.serverName,
    });
    if (options.avatarUrl) params.set('avatarUrl', options.avatarUrl);
    return this.get(`/bot-api/newbie/welcome-card?${params.toString()}`);
  }

  // ── Status Prefix ──

  async applyStatusPrefix(dto: StatusPrefixApplyDto): Promise<StatusPrefixApplyResult> {
    return this.post('/bot-api/status-prefix/apply', dto);
  }

  async resetStatusPrefix(dto: StatusPrefixResetDto): Promise<StatusPrefixResetResult> {
    return this.post('/bot-api/status-prefix/reset', dto);
  }

  // ── Auto Channel ──

  async autoChannelButtonClick(dto: AutoChannelButtonClickDto): Promise<AutoChannelButtonResult> {
    return this.post('/bot-api/auto-channel/button-click', dto);
  }

  async autoChannelSubOption(dto: AutoChannelSubOptionDto): Promise<AutoChannelButtonResult> {
    return this.post('/bot-api/auto-channel/sub-option', dto);
  }

  /** 모달 제출 → 서버 재검증(F-VOICE-127). deferReply 이후 호출되므로 전역 타임아웃(10s)을 쓴다. */
  async autoChannelNameSubmit(dto: AutoChannelNameSubmitDto): Promise<AutoChannelNameSubmitResult> {
    return this.post('/bot-api/auto-channel/name-submit', dto);
  }

  /**
   * showModal 전 모달 사양 조회(F-VOICE-126) — interaction 3초 데드라인 안에서 호출되므로
   * per-request 타임아웃(1.5s)을 쓴다. 404(off/설정없음/{input} 0회)는 axios가 throw한다 —
   * 호출측이 예외 종류를 구분하지 않고 동일 처리한다(D-9).
   */
  async autoChannelNameInput(query: AutoChannelNameInputQuery): Promise<AutoChannelNameInputSpec> {
    const params = new URLSearchParams({
      buttonId: String(query.buttonId),
      guildId: query.guildId,
    });
    if (query.subOptionId !== undefined) params.set('subOptionId', String(query.subOptionId));
    if (query.locale) params.set('locale', query.locale);
    return this.get(`/bot-api/auto-channel/name-input?${params.toString()}`, {
      timeout: AUTO_CHANNEL_NAME_INPUT_TIMEOUT_MS,
    });
  }

  // ── Sticky Message ──

  async sendMessageCreated(dto: MessageCreatedDto): Promise<void> {
    await this.post('/bot-api/sticky-message/message-created', dto);
  }

  async getStickyMessageConfigs(
    guildId: string,
  ): Promise<BotApiResponse<StickyMessageConfigItem[]>> {
    return this.get(`/bot-api/sticky-message/configs?guildId=${guildId}`);
  }

  async deleteStickyMessageByChannel(
    guildId: string,
    channelId: string,
  ): Promise<{ ok: boolean; deletedCount: number }> {
    return this.delete(
      `/bot-api/sticky-message/by-channel?guildId=${guildId}&channelId=${channelId}`,
    );
  }

  // ── Message Tracking ──

  async sendMessageCounted(dto: MessageCountedDto): Promise<void> {
    await this.post('/bot-api/message-tracking/counted', dto);
  }

  // ── Usage Analytics ──

  async sendCommandUsed(dto: CommandUsedDto): Promise<void> {
    await this.post('/bot-api/usage-analytics/command-used', dto);
  }

  /** 길드 생애주기(join/leave) 수집 — 유저 ID·길드명 미포함 (F-USAGE-013, U9a-3) */
  async sendGuildLifecycleEvent(dto: GuildLifecycleEventDto): Promise<void> {
    await this.post('/bot-api/usage-analytics/guild-lifecycle', dto);
  }

  /** 설정형 도메인 자동 동작 1건 카운트 — 유저/채널/역할 ID 미포함 (F-USAGE-041/042/043) */
  async recordAutoAction(dto: AutoActionRecordDto): Promise<void> {
    await this.post('/bot-api/usage-analytics/auto-action', dto);
  }

  /**
   * F-VOICE-144 — 디스코드 채널 삭제 사실을 API 에 알린다(설정 자동 조치 기록 ④).
   * `POST /bot-api/settings-auto-action/channel-deleted`. 응답 `{ ok, recorded }` 는 봇이 쓰지 않는다.
   * ⚠️ `recordAutoAction()`(usage-analytics 자동 동작 *집계*)과 다른 기능이다. 채널 이름은 보내지 않는다.
   * 호출부는 await 하지 않고 `.catch` 로 흡수해야 한다(실패 시 그대로 throw, 재시도 없음).
   */
  async reportChannelDeleted(dto: SettingsChannelDeletedDto): Promise<void> {
    await this.post('/bot-api/settings-auto-action/channel-deleted', dto);
  }

  // ── Voice User Count ──

  async pushVoiceUserCounts(counts: GuildVoiceUserCount[]): Promise<void> {
    await this.post('/bot-api/voice/user-count', { counts });
  }

  // ── Co-Presence ──

  /**
   * @param scannedGuildIds - 이번 tick에 스캔한 전체 길드 ID(빈 길드 포함, optional).
   * 부재 시 API는 snapshots 에서 길드 ID를 파생(하위호환). 완전히 빈 길드는 스냅샷에
   * 등장하지 않으므로 세션 미종료(좀비) 위험 방지를 위해 전달을 권장한다(M-2).
   */
  async pushCoPresenceSnapshots(
    snapshots: CoPresenceSnapshot[],
    scannedGuildIds?: string[],
  ): Promise<void> {
    await this.post('/bot-api/co-presence/snapshots', { snapshots, scannedGuildIds });
  }

  async pushCoPresenceFlush(): Promise<void> {
    await this.post('/bot-api/co-presence/flush', {});
  }

  // ── Co-Presence (Phase 5: 베스트 프렌드) ──

  /**
   * 닉네임·아바타 URL 등 개인정보가 액세스 로그(query string)에 남지 않도록 POST body로 전송한다.
   */
  async getMyBestFriends(options: GetMyBestFriendsOptions): Promise<BestFriendCardResponse> {
    return this.post('/bot-api/co-presence/best-friends', options);
  }

  /**
   * 듀오 케미 카드(F-COPRESENCE-029) — 닉네임·아바타 URL 등 개인정보가 액세스 로그(query string)에
   * 남지 않도록 POST body로 전송한다. 🔒 불변식(계획 §2-F): `options.userId`는 언제나 커맨드
   * 실행자(`interaction.user.id`)다.
   */
  async getDuoChemistry(options: GetDuoChemistryOptions): Promise<DuoChemistryCardResponse> {
    return this.post('/bot-api/co-presence/duo', options);
  }

  /**
   * [채널에 공개하기] 클릭 시점 재검증(F-COPRESENCE-035, B3) — 렌더·집계 없이 상대 표시 거부 여부만 확인한다.
   * 거부(self 포함)는 400 `CO_PRESENCE_PEER_HIDDEN` 으로 throw 되며 `isDuoPeerHiddenError` 로 판별한다.
   */
  async checkDuoEligibility(options: CheckDuoEligibilityOptions): Promise<DuoEligibilityResponse> {
    return this.post('/bot-api/co-presence/duo/eligibility', options);
  }

  // ── Me ──

  /**
   * 닉네임·아바타 URL 등 개인정보가 액세스 로그(query string)에 남지 않도록 POST body로 전송한다(R3, F-VOICE-082).
   * `mentType` 지정 시(F-VOICE-079 R3.5) LLM 단위 타임아웃(8초)+카드 조회/렌더 여유를 반영해
   * per-request 타임아웃을 오버라이드한다 — 전역 타임아웃(10s)은 무옵션 경로에서 불변이다.
   */
  async getMeProfile(options: GetMeProfileOptions): Promise<MeProfileResponse> {
    const config = options.mentType ? { timeout: ME_PROFILE_MENT_TIMEOUT_MS } : undefined;
    return this.post('/bot-api/me/profile', options, config);
  }

  /**
   * `/me 보기:결산` 연말 결산 카드(B1) — 개인정보가 액세스 로그에 남지 않도록 POST body 로 전송한다.
   * API 는 항상 200 을 반환하며 실패는 `ok:false` 로 표현한다.
   */
  async getRecapCard(options: GetRecapCardOptions): Promise<MeRecapBotResponse> {
    return this.post('/bot-api/me/recap', options);
  }

  /**
   * `/me 보기:뱃지` 뱃지 컬렉션 카드 — 개인정보가 액세스 로그에 남지 않도록 POST body 로 전송한다.
   * API 는 항상 200 을 반환하며 실패는 `ok:false` 로 표현한다.
   */
  async getBadgeCollectionCard(
    options: GetBadgeCollectionCardOptions,
  ): Promise<MeBadgesBotResponse> {
    return this.post('/bot-api/me/badges', options);
  }

  /** [💬 활동 상세] 버튼(F-VOICE-064) — 음성×메시지 순위 분해 조회. */
  async getMeActivityDetail(guildId: string, userId: string): Promise<MeActivityDetailResponse> {
    const params = new URLSearchParams({ guildId, userId });
    return this.post(`/bot-api/me/activity-detail?${params.toString()}`, {});
  }

  /**
   * [🏆 서버 리더보드] 버튼(F-VOICE-065) — 길드 레벨 TOP N 조회.
   *
   * @deprecated U9(F-LVL-26)에서 버튼 응답이 캔버스 카드로 교체되며 유일한 소비자가 사라졌다.
   * 신규 코드는 `getLevelLeaderboardCard()`를 쓴다. 즉시 제거하지 않는 이유는 API·봇이 별도
   * 컨테이너로 배포돼 롤아웃 창이 있고, 봇만 롤백될 때 구 봇이 그대로 동작하는 안전판이기
   * 때문이다(계획 rank-command.md §8-1). 제거 시점은 롤아웃 안정화 후 별건.
   */
  async getGuildLevelLeaderboard(
    guildId: string,
    limit: number,
  ): Promise<LevelLeaderboardResponse> {
    const params = new URLSearchParams({ guildId, limit: String(limit) });
    return this.get(`/bot-api/level/leaderboard?${params.toString()}`);
  }

  // ── Level (Rank / Leaderboard Cards, U9) ──

  /**
   * `/rank` 개인 랭크 카드(F-LVL-24/25) — 닉네임·아바타 URL 등 개인정보가 액세스 로그
   * (query string)에 남지 않도록 POST body로 전송한다(`getMeProfile` 관례).
   */
  async getLevelRankCard(options: GetLevelRankCardOptions): Promise<LevelRankCardResponse> {
    return this.post('/bot-api/level/rank-card', options);
  }

  /**
   * `/랭킹` 커맨드 · 페이지 버튼 · `/me` [서버 리더보드] 버튼 3개 진입점이 공유하는 보드
   * 카드(F-LVL-26) 조회.
   */
  async getLevelLeaderboardCard(
    options: GetLevelLeaderboardCardOptions,
  ): Promise<LevelLeaderboardCardResponse> {
    return this.post('/bot-api/level/leaderboard-card', options);
  }

  // ── Guild Member ──

  async upsertGuildMember(dto: GuildMemberUpsertDto): Promise<void> {
    await this.post('/bot-api/guild-member/upsert', dto);
  }

  async bulkUpsertGuildMembers(dto: GuildMemberBulkUpsertDto): Promise<void> {
    await this.post('/bot-api/guild-member/sync', dto);
  }

  async deactivateGuildMember(dto: GuildMemberDeactivateDto): Promise<void> {
    await this.post('/bot-api/guild-member/deactivate', dto);
  }

  async updateGuildMemberByUserUpdate(dto: GuildMemberUserUpdateDto): Promise<void> {
    await this.post('/bot-api/guild-member/update-global-profile', dto);
  }

  /**
   * bulk sync 완료(전량 확보 성공) 후 재적자 집합 밖 기존 활성 행을 비활성화한다(다운타임 중
   * 퇴장 반영 보정). 호출측은 부분 목록으로 절대 호출해서는 안 된다 — {@link GuildMemberReconcileDto} 참조.
   */
  async reconcileGuildMembers(dto: GuildMemberReconcileDto): Promise<GuildMemberReconcileResult> {
    return this.post('/bot-api/guild-member/reconcile', dto);
  }

  // ── Guild Role ──

  /**
   * 길드 역할 전량 스냅샷 + reconcile(F-GUILD-ROLE-001/002/006).
   * 호출측은 부분 목록으로 절대 호출해서는 안 된다 — {@link GuildRoleSyncDto} 참조.
   */
  async syncGuildRoles(dto: GuildRoleSyncDto): Promise<GuildRoleSyncResult> {
    return this.post('/bot-api/guild-role/sync', dto);
  }

  async upsertGuildRole(dto: GuildRoleUpsertDto): Promise<GuildRoleMutationResult> {
    return this.post('/bot-api/guild-role/upsert', dto);
  }

  async markGuildRoleDeleted(dto: GuildRoleMarkDeletedDto): Promise<GuildRoleMutationResult> {
    return this.post('/bot-api/guild-role/mark-deleted', dto);
  }

  /** 봇이 길드에서 이탈했을 때 해당 길드 역할 스냅샷을 하드 삭제한다(F-GUILD-ROLE-007). */
  async purgeGuildRoles(dto: GuildRolePurgeDto): Promise<GuildRolePurgeResult> {
    return this.post('/bot-api/guild-role/purge-guild', dto);
  }

  // ── Guild Directory ──

  /** 봇 기동 시 실제 참여 중인 길드 목록으로 guild_directory 를 정정한다(F-SUPER-ADMIN-039). */
  async reconcileGuildDirectory(
    dto: GuildDirectoryReconcileDto,
  ): Promise<GuildDirectoryReconcileResult> {
    return this.post('/bot-api/super-admin/guild-directory/reconcile', dto);
  }

  // ── Role Panel ──

  async getRolePanelConfig(guildId: string): Promise<BotApiResponse<BotRolePanelConfigDto[]>> {
    return this.get(`/bot-api/role-panel/config?guildId=${guildId}`);
  }

  // ── Admin Assist (E8, F-ADMIN-ASSIST-078~081, M4/A2 봇 read-only 진입점) ──

  /**
   * `/관리도우미` 슬래시 커맨드(E8) — `AdminAssistService.recommend()` 를 웹 E1 과 동일하게
   * 호출한다. ⚠️ **전역 타임아웃(10s)을 반드시 덮는다** — 정상 응답이 `kind='recipe'`·
   * `'generative'` 경로에서 수십 초가 정상 범위이며, 기본값을 쓰면 봇은 포기해도 API 는
   * 계속 돌아 쿼터가 소모되고 이력엔 `success` 로 남는데 사용자는 오류를 본다(조용한 실패
   * 모드, endpoint-spec §5E-9).
   *
   * 판별 가능한 결과를 반환한다(§5E-6 🟨 권고 ⓐ) — "쿼터 소진"(429, 정상·예상된 결과)과
   * "장애"가 커맨드 핸들러의 `catch` 안 문자열 매칭으로 뭉개지지 않도록 axios 에러 해석을
   * 이 메서드 안에 가둔다.
   */
  async getAdminAssistRecommendation(
    options: GetAdminAssistRecommendationOptions,
  ): Promise<AdminAssistRecommendationResult> {
    try {
      const data = await this.post<AdminAssistRecommendResponse>(
        '/bot-api/admin-assist/recommend',
        options,
        { timeout: ADMIN_ASSIST_RECOMMEND_TIMEOUT_MS },
      );
      return { ok: true, data };
    } catch (error) {
      if (
        isAxiosError(error) &&
        error.response?.status === HTTP_STATUS_TOO_MANY_REQUESTS &&
        this.extractQuotaExhaustedReason(error.response.data) === 'quota_exhausted'
      ) {
        return { ok: false, reason: 'quota_exhausted' };
      }
      return { ok: false, reason: 'error' };
    }
  }

  /**
   * 429 응답 바디에서 quota_exhausted 판별용 reason 을 추출한다.
   * ⚠️ `AllExceptionsFilter`(apps/api/src/common/filters/all-exceptions.filter.ts)는
   * `code`/`params`/`errors` 만 최상위로 승격하고 나머지는 `message` 아래 그대로 둔다 —
   * 즉 `HttpException({ reason }, 429)` 의 실제 응답 계약은 `body.message.reason` 이다
   * (apps/api/test/admin-assist-bot-entrypoint.e2e-spec.ts 가 이 형태를 단언한다).
   * 최상위 `body.reason` 도 함께 허용해 향후 다른 봉투로도 견고하게 판별한다.
   */
  private extractQuotaExhaustedReason(data: unknown): string | undefined {
    if (typeof data !== 'object' || data === null) {
      return undefined;
    }
    // as 단언 사유: axios 에러 바디는 unknown 이라 형태를 직접 좁힐 수 없어, 두 후보 위치를
    // 낙관적으로 조회하는 얕은 구조 단언이 필요하다(둘 다 없으면 undefined 로 자연 수렴).
    const envelope = data as { reason?: unknown; message?: { reason?: unknown } };
    if (typeof envelope.reason === 'string') {
      return envelope.reason;
    }
    if (typeof envelope.message === 'object' && envelope.message !== null) {
      const nestedReason = (envelope.message as { reason?: unknown }).reason;
      if (typeof nestedReason === 'string') {
        return nestedReason;
      }
    }
    return undefined;
  }

  // ── Locale ──

  /** 저장된 user locale 조회 (F-GENERAL-005). 봇 리졸버 1순위. */
  async getUserLocale(userId: string): Promise<UserLocaleResponse> {
    return this.get(`/bot-api/locale/user/${userId}`, { timeout: USER_LOCALE_TIMEOUT_MS });
  }

  /** user locale 저장 (F-GENERAL-005). role-panel 게이트 버튼(F-ROLE-PANEL-010)이 1차 호출자. */
  async setUserLocale(userId: string, locale: SupportedLocale): Promise<UserLocaleResponse> {
    return this.put(`/bot-api/locale/user/${userId}`, { locale });
  }

  // ── Health ──

  /** API 서버 연결 확인. 실패 시 예외를 throw한다. */
  async healthCheck(): Promise<void> {
    await firstValueFrom(this.http.get('/bot-api/health'));
  }

  /**
   * 봇 헬스 스냅샷 push (F-SUPER-ADMIN-016). 호출측(스케줄러)에서 fire-and-forget으로
   * 사용하며 실패를 흡수해야 한다 — 이 메서드는 실패 시 그대로 throw한다.
   */
  async sendHealthSnapshot(snapshot: BotHealthSnapshotDto): Promise<void> {
    await this.post('/bot-api/health/snapshot', snapshot);
  }

  // ── Internal ──

  private logReqFailure(method: string, path: string, err: unknown): void {
    const { level, payload } = buildBotApiFailureReport(method, path, err);
    this.logger[level](payload);
  }

  private async post<T>(path: string, body: unknown, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await firstValueFrom(this.http.post<T>(path, body, config));
      return response.data;
    } catch (err) {
      this.logReqFailure('POST', path, err);
      throw err;
    }
  }

  private async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await firstValueFrom(this.http.get<T>(path, config));
      return response.data;
    } catch (err) {
      this.logReqFailure('GET', path, err);
      throw err;
    }
  }

  private async delete<T>(path: string): Promise<T> {
    try {
      const response = await firstValueFrom(this.http.delete<T>(path));
      return response.data;
    } catch (err) {
      this.logReqFailure('DELETE', path, err);
      throw err;
    }
  }

  private async put<T>(path: string, body: unknown, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await firstValueFrom(this.http.put<T>(path, body, config));
      return response.data;
    } catch (err) {
      this.logReqFailure('PUT', path, err);
      throw err;
    }
  }
}
