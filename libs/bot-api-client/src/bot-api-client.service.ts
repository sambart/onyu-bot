import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import type { LevelLeaderboardResponse, SupportedLocale } from '@onyu/shared';
import type { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';

import type {
  AutoChannelButtonClickDto,
  AutoChannelButtonResult,
  AutoChannelSubOptionDto,
  BestFriendCardResponse,
  BotApiResponse,
  BotHealthSnapshotDto,
  BotRolePanelConfigDto,
  CommandUsedDto,
  CoPresenceSnapshot,
  DuoChemistryCardResponse,
  GetDuoChemistryOptions,
  GetMeProfileOptions,
  GetMyBestFriendsOptions,
  GuildDirectoryReconcileDto,
  GuildDirectoryReconcileResult,
  GuildLifecycleEventDto,
  GuildMemberBulkUpsertDto,
  GuildMemberDeactivateDto,
  GuildMemberReconcileDto,
  GuildMemberReconcileResult,
  GuildMemberUpsertDto,
  GuildMemberUserUpdateDto,
  GuildVoiceUserCount,
  KickMemberDto,
  MeActivityDetailResponse,
  MemberDisplayNameResponse,
  MemberJoinDto,
  MeProfileResponse,
  MessageCountedDto,
  MessageCreatedDto,
  MissionMyResponse,
  MissionRefreshDto,
  MocoMyResponse,
  MocoRankResponse,
  NewbieConfigDto,
  RoleAssignedDto,
  RoleModifyDto,
  StatusPrefixApplyDto,
  StatusPrefixApplyResult,
  StatusPrefixResetDto,
  StatusPrefixResetResult,
  StickyMessageConfigItem,
  UserLocaleResponse,
  VoiceStateUpdateDto,
  VoiceSyncDto,
} from './types';

/**
 * 멘트 포함 `/me` 요청 per-request 타임아웃(F-VOICE-079 R3.5) — LLM 단위 8초 + 카드
 * 조회/렌더 여유. 전역 타임아웃(10s)은 무옵션 경로에서 불변이다(PRD 명시).
 */
const ME_PROFILE_MENT_TIMEOUT_MS = 20_000;

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

  async getNewbieConfig(guildId: string): Promise<NewbieConfigDto | null> {
    try {
      const response = await this.get<BotApiResponse<NewbieConfigDto>>(
        `/bot-api/newbie/config?guildId=${guildId}`,
      );
      return response.data ?? null;
    } catch {
      return null;
    }
  }

  async notifyRoleAssigned(dto: RoleAssignedDto): Promise<void> {
    await this.post('/bot-api/newbie/role-assigned', dto);
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

  /** [💬 활동 상세] 버튼(F-VOICE-064) — 음성×메시지 순위 분해 조회. */
  async getMeActivityDetail(guildId: string, userId: string): Promise<MeActivityDetailResponse> {
    const params = new URLSearchParams({ guildId, userId });
    return this.post(`/bot-api/me/activity-detail?${params.toString()}`, {});
  }

  /** [🏆 서버 리더보드] 버튼(F-VOICE-065) — 길드 레벨 TOP N 조회. */
  async getGuildLevelLeaderboard(
    guildId: string,
    limit: number,
  ): Promise<LevelLeaderboardResponse> {
    const params = new URLSearchParams({ guildId, limit: String(limit) });
    return this.get(`/bot-api/level/leaderboard?${params.toString()}`);
  }

  // ── Guild ──

  async getMemberDisplayName(
    guildId: string,
    memberId: string,
  ): Promise<MemberDisplayNameResponse> {
    return this.get(`/bot-api/guilds/${guildId}/members/${memberId}/display-name`);
  }

  async addRole(dto: RoleModifyDto): Promise<BotApiResponse> {
    return this.post(`/bot-api/guilds/${dto.guildId}/members/${dto.memberId}/roles/add`, {
      roleId: dto.roleId,
    });
  }

  async removeRole(dto: RoleModifyDto): Promise<BotApiResponse> {
    return this.post(`/bot-api/guilds/${dto.guildId}/members/${dto.memberId}/roles/remove`, {
      roleId: dto.roleId,
    });
  }

  async kickMember(dto: KickMemberDto): Promise<BotApiResponse> {
    return this.post(`/bot-api/guilds/${dto.guildId}/members/${dto.memberId}/kick`, {
      reason: dto.reason,
    });
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

  // ── Locale ──

  /** 저장된 user locale 조회 (F-GENERAL-005). 봇 리졸버 1순위. */
  async getUserLocale(userId: string): Promise<UserLocaleResponse> {
    return this.get(`/bot-api/locale/user/${userId}`);
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

  private async post<T>(path: string, body: unknown, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await firstValueFrom(this.http.post<T>(path, body, config));
      return response.data;
    } catch (err) {
      this.logger.error(`[BOT-API] POST ${path} failed`, err);
      throw err;
    }
  }

  private async get<T>(path: string): Promise<T> {
    try {
      const response = await firstValueFrom(this.http.get<T>(path));
      return response.data;
    } catch (err) {
      this.logger.error(`[BOT-API] GET ${path} failed`, err);
      throw err;
    }
  }

  private async delete<T>(path: string): Promise<T> {
    try {
      const response = await firstValueFrom(this.http.delete<T>(path));
      return response.data;
    } catch (err) {
      this.logger.error(`[BOT-API] DELETE ${path} failed`, err);
      throw err;
    }
  }

  private async put<T>(path: string, body: unknown, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await firstValueFrom(this.http.put<T>(path, body, config));
      return response.data;
    } catch (err) {
      this.logger.error(`[BOT-API] PUT ${path} failed`, err);
      throw err;
    }
  }
}
