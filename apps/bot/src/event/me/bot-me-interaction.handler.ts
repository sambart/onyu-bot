import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { ActivityDetailSection } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import { type ButtonInteraction, EmbedBuilder, type Interaction } from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';

/** i18n 네임스페이스 — commands (BotI18nService.BOT_NAMESPACES에 이미 포함) */
const NS = 'commands';
const CUSTOM_ID_PREFIX = 'me:';
const CUSTOM_ID_ACTIVITY_DETAIL = 'me:activity_detail';
const CUSTOM_ID_LEADERBOARD = 'me:leaderboard';
const LEADERBOARD_LIMIT = 10;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const EMBED_COLOR = 0x5865f2;

/**
 * `/미` 카드 버튼([💬 활동 상세]/[🏆 서버 리더보드]) interactionCreate 이벤트를 처리한다.
 * `role-panel/bot-role-panel-interaction.handler.ts` 패턴 준용(F-VOICE-064/065).
 */
@Injectable()
export class BotMeInteractionHandler {
  private readonly logger = new Logger(BotMeInteractionHandler.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @On('interactionCreate')
  async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith(CUSTOM_ID_PREFIX)) return;

    // DM 컨텍스트 차단 — UF-VOICE-CMD-003(카드는 길드 채널 게시물이므로 DM 클릭 불가하나 방어)
    if (!interaction.guildId) return;

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    try {
      await interaction.deferReply({ ephemeral: true });
      const locale = await this.localeResolver.resolve(userId, guildId, interaction.locale);

      if (interaction.customId === CUSTOM_ID_ACTIVITY_DETAIL) {
        await this.handleActivityDetail(guildId, userId, locale, interaction);
        return;
      }

      if (interaction.customId === CUSTOM_ID_LEADERBOARD) {
        await this.handleLeaderboard(guildId, locale, interaction);
      }
    } catch (error) {
      this.logger.error(
        `[ME] Interaction failed: customId=${interaction.customId}`,
        error instanceof Error ? error.stack : error,
      );
      await this.replyGenericError(interaction, guildId, userId);
    }
  }

  private async handleActivityDetail(
    guildId: string,
    userId: string,
    locale: string,
    interaction: ButtonInteraction,
  ): Promise<void> {
    const result = await this.apiClient.getMeActivityDetail(guildId, userId);

    const embed = new EmbedBuilder().setColor(EMBED_COLOR).addFields(
      {
        name: this.i18n.t(locale, `${NS}.meActivityVoiceLabel`),
        value: this.formatSection(locale, result.data.voice, (v) =>
          this.formatDuration(v.totalSec, locale),
        ),
      },
      {
        name: this.i18n.t(locale, `${NS}.meActivityMessageLabel`),
        value: this.formatSection(
          locale,
          result.data.message,
          (m) => `${m.totalCount.toLocaleString()}`,
        ),
      },
    );
    embed.setFooter({ text: this.i18n.t(locale, `${NS}.meActivityFooter`) });

    await interaction.editReply({ embeds: [embed] });
  }

  private async handleLeaderboard(
    guildId: string,
    locale: string,
    interaction: ButtonInteraction,
  ): Promise<void> {
    const result = await this.apiClient.getGuildLevelLeaderboard(guildId, LEADERBOARD_LIMIT);

    if (result.users.length === 0) {
      await interaction.editReply({ content: this.i18n.t(locale, `${NS}.meLeaderboardDisabled`) });
      return;
    }

    const rows = result.users
      .map((u) =>
        this.i18n.t(locale, `${NS}.meLeaderboardRow`, {
          rank: u.rank,
          nickName: u.nickName,
          level: u.level,
          xp: u.xp,
        }),
      )
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(this.i18n.t(locale, `${NS}.meLeaderboardTitle`))
      .setDescription(rows);

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * 활동 상세 섹션(음성/메시지) 값을 텍스트로 변환한다.
   * `null`(활동 없음)/`{error:true}`(조회 실패)/정상 데이터 3분기를 공통 처리(독립 실패 격리).
   */
  private formatSection<TData extends Record<string, unknown>>(
    locale: string,
    section: ActivityDetailSection<TData>,
    formatValue: (data: TData & { rank: number; totalUsers: number; upPercent: number }) => string,
  ): string {
    if (section === null) {
      return this.i18n.t(locale, `${NS}.meActivityNone`);
    }
    if ('error' in section) {
      return this.i18n.t(locale, `${NS}.meActivityFetchError`);
    }

    const rankLine = this.i18n.t(locale, `${NS}.meActivityRankLine`, {
      rank: section.rank,
      total: section.totalUsers,
      percent: section.upPercent,
    });
    return `${formatValue(section)}\n${rankLine}`;
  }

  private formatDuration(sec: number, locale: string): string {
    const hours = Math.floor(sec / SECONDS_PER_HOUR);
    const minutes = Math.floor((sec % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    if (locale === 'en') {
      return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    }
    return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
  }

  private async replyGenericError(
    interaction: Interaction,
    guildId: string,
    userId: string,
  ): Promise<void> {
    try {
      const locale = await this.localeResolver.resolve(userId, guildId, interaction.locale);
      const content = this.i18n.t(locale, `${NS}.meActivityFetchError`);
      if (interaction.isRepliable() && (interaction.replied || interaction.deferred)) {
        await interaction.followUp({ ephemeral: true, content });
      } else if (interaction.isRepliable()) {
        await interaction.reply({ ephemeral: true, content });
      }
    } catch {
      // Discord 응답 자체가 실패한 경우 무시
    }
  }
}
