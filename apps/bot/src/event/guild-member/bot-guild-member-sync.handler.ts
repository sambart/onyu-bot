import { InjectDiscordClient, Once } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService, type GuildMemberUpsertDto } from '@onyu/bot-api-client';
import { Client, type Guild, type GuildMember } from 'discord.js';

import { waitForApi } from '../../common/util/wait-for-api';

const BATCH_SIZE = 500;

/**
 * Discord clientReady 이벤트 수신 후 모든 길드의 멤버를 bulk upsert한다.
 * F-GUILD-MEMBER-001: 봇 시작 시 초기 동기화.
 */
@Injectable()
export class BotGuildMemberSyncHandler {
  private readonly logger = new Logger(BotGuildMemberSyncHandler.name);

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly apiClient: BotApiClientService,
  ) {}

  @Once('clientReady')
  async handleReady(): Promise<void> {
    this.logger.log('[GUILD-MEMBER-SYNC] Discord ready — waiting for API...');

    const isApiReady = await waitForApi(this.apiClient);
    if (!isApiReady) {
      this.logger.error('[GUILD-MEMBER-SYNC] API 연결 실패 — guild member sync 중단');
      return;
    }

    await this.reconcileGuildDirectory();

    this.logger.log('[GUILD-MEMBER-SYNC] API connected — syncing all guild members...');

    let totalSynced = 0;

    for (const guild of this.client.guilds.cache.values()) {
      const synced = await this.syncGuild(guild);
      totalSynced += synced;
    }

    this.logger.log(
      `[GUILD-MEMBER-SYNC] Complete — ${totalSynced} member(s) synced across all guilds`,
    );
  }

  /**
   * 단일 길드의 전체 멤버를 fetch하여 bulk upsert한다.
   * guildCreate 핸들러에서도 재사용된다.
   *
   * 전체 멤버 확보(fetch) + 모든 upsert 배치 전송이 **전부 성공한 경우에만** reconcile을
   * 호출해 "이번에 확인된 재적자 집합 밖" 의 기존 활성 행을 비활성화한다(다운타임 중 퇴장
   * 반영 보정, 2026-08-07 사용자 확정). fetch 실패나 배치 중간 실패 시에는 부분 목록으로
   * reconcile을 호출하지 않는다 — 재적자를 대량 오탐 비활성화하는 사고를 막기 위한 안전 가드다.
   * (최종 방어선은 API 측 `reconcileActiveMembers`의 빈 집합/비율 가드가 담당한다.)
   *
   * @returns 동기화된 멤버 수 (fetch 실패 시 0)
   */
  async syncGuild(guild: Guild): Promise<number> {
    let memberList: GuildMember[];

    try {
      const members = await guild.members.fetch({ withPresences: false });
      memberList = [...members.values()];
    } catch (err) {
      this.logger.error(
        `[GUILD-MEMBER-SYNC] guild=${guild.id} fetch failed`,
        err instanceof Error ? err.stack : err,
      );
      return 0;
    }

    try {
      const batches = this.chunk(memberList, BATCH_SIZE);

      for (const batch of batches) {
        await this.apiClient.bulkUpsertGuildMembers({
          guildId: guild.id,
          members: batch.map((m) => this.toUpsertDto(guild.id, m)),
        });
      }

      this.logger.log(
        `[GUILD-MEMBER-SYNC] guild=${guild.id} synced ${memberList.length} member(s)`,
      );
    } catch (err) {
      this.logger.error(
        `[GUILD-MEMBER-SYNC] guild=${guild.id} upsert failed — skipping reconcile`,
        err instanceof Error ? err.stack : err,
      );
      return 0;
    }

    await this.reconcile(guild.id, memberList);

    return memberList.length;
  }

  /**
   * 전량 확보·전송이 확인된 멤버 목록으로 reconcile을 호출한다.
   * 실패해도 sync 자체의 성공 여부에는 영향을 주지 않는다(보정은 best-effort).
   */
  private async reconcile(guildId: string, memberList: GuildMember[]): Promise<void> {
    try {
      const result = await this.apiClient.reconcileGuildMembers({
        guildId,
        activeUserIds: memberList.map((m) => m.id),
      });

      if (result.skipped) {
        this.logger.warn(
          `[GUILD-MEMBER-SYNC] guild=${guildId} reconcile skipped: reason=${result.skipReason}`,
        );
      } else if (result.deactivated > 0) {
        this.logger.log(
          `[GUILD-MEMBER-SYNC] guild=${guildId} reconcile deactivated ${result.deactivated} stale member(s)`,
        );
      }
    } catch (err) {
      this.logger.error(
        `[GUILD-MEMBER-SYNC] guild=${guildId} reconcile call failed`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  /**
   * 봇이 실제로 참여 중인 길드 목록 전체를 API 로 1회 전송해 guild_directory 를 정정한다
   * (F-SUPER-ADMIN-039, super-admin 도메인 소유 — 본 핸들러는 clientReady 트리거만 공유한다).
   * 실패는 로그만 남기고 재시도하지 않는다 — 다음 봇 재기동이 자연 재시도 지점이다(UC-17 §6.1).
   */
  private async reconcileGuildDirectory(): Promise<void> {
    try {
      const guilds = [...this.client.guilds.cache.values()].map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
      }));

      const result = await this.apiClient.reconcileGuildDirectory({ guilds });

      if (result.skipped) {
        this.logger.warn(`[GUILD-DIRECTORY-RECONCILE] skipped: reason=${result.skipReason}`);
      } else if (result.deactivated > 0) {
        this.logger.log(
          `[GUILD-DIRECTORY-RECONCILE] deactivated ${result.deactivated} stale guild(s), upserted ${result.upserted}`,
        );
      }
    } catch (err) {
      this.logger.error(
        '[GUILD-DIRECTORY-RECONCILE] reconcile call failed',
        err instanceof Error ? err.stack : err,
      );
    }
  }

  private toUpsertDto(guildId: string, member: GuildMember): GuildMemberUpsertDto {
    // TODO(maintainer 2026-04-04): 디버그 로그 — nick 누락 원인 조사 후 제거
    if (!member.user.bot) {
      this.logger.debug(
        `[NICK-DEBUG] user=${member.id} nickname=${member.nickname} ` +
          `displayName=${member.displayName} globalName=${member.user.globalName} ` +
          `username=${member.user.username}`,
      );
    }

    return {
      guildId,
      userId: member.id,
      displayName: member.displayName,
      username: member.user.username,
      nick: member.nickname,
      avatarUrl: member.displayAvatarURL({ size: 128 }),
      isBot: member.user.bot,
      joinedAt: member.joinedAt?.toISOString() ?? null,
    };
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
