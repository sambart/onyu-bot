import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { BestFriendCardResponse, CanvasCardLocale } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  GuildMember,
} from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';

// 집계 기간 (일) — 30일 고정.
// getMyBestFriends period 파라미터가 7 | 30 | 90 리터럴 유니온이므로 as const 필수
const PERIOD = 30 as const;
// TOP N — 5명 고정
const LIMIT = 5;
// 대시보드 기본 URL (WEB_URL 미설정 시 prod 도메인)
const DEFAULT_WEB_URL = 'https://onyu.dev';

@Command({
  name: 'best-friend',
  nameLocalizations: { ko: '친한친구' },
  description: 'Show my best friend TOP card',
  descriptionLocalizations: { ko: '내 베스트 프렌드 TOP을 카드로 보여줍니다' },
})
@Injectable()
export class BestFriendCommand {
  private readonly logger = new Logger(BestFriendCommand.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onBestFriend(@InteractionEvent() interaction: ChatInputCommandInteraction): Promise<void> {
    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    if (!interaction.guildId) {
      await interaction.reply({
        content: this.i18n.t(locale, 'errors.guildOnly'),
        ephemeral: true,
      });
      return;
    }

    // 공개 응답 고정 (ephemeral 없음)
    await interaction.deferReply();

    try {
      // GuildMember 캐스팅 — discord-nestjs CommandInteraction.member는 APIInteractionGuildMember | GuildMember 유니온
      const displayName =
        (interaction.member as GuildMember)?.displayName ?? interaction.user.displayName;
      const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });

      const result = await this.apiClient.getMyBestFriends({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        displayName,
        avatarUrl,
        period: PERIOD,
        limit: LIMIT,
        locale: this.toCanvasLocale(locale),
      });

      const linkButtonRow = this.buildLinkButtonRow(interaction.guildId, locale);

      if (!result.ok) {
        await interaction.editReply({
          content: this.i18n.t(locale, 'commands.bestFriendError'),
          components: [linkButtonRow],
        });
        return;
      }

      if (!result.data) {
        await interaction.editReply({
          content: this.i18n.t(locale, 'commands.bestFriendNoData', { days: result.days }),
          components: [linkButtonRow],
        });
        return;
      }

      await this.renderCard(interaction, result, linkButtonRow);
    } catch (error) {
      this.logger.error(
        'BestFriend command error',
        error instanceof Error ? error.stack : String(error),
      );
      await interaction.editReply({ content: this.i18n.t(locale, 'commands.bestFriendError') });
    }
  }

  /** LocaleResolverService는 'ko' | 'en' 중 하나만 반환하므로 안전하게 캔버스 카드 로케일로 변환한다 */
  private toCanvasLocale(locale: string): CanvasCardLocale {
    return locale === 'ko' ? 'ko' : 'en';
  }

  private buildLinkButtonRow(guildId: string, locale: string): ActionRowBuilder<ButtonBuilder> {
    // WEB_URL은 런타임에 읽는다 — 모듈 import 시점에 평가하면 ConfigModule의 .env 로드 전이라 fallback이 굳을 수 있다
    const webUrl = process.env['WEB_URL'] ?? DEFAULT_WEB_URL;
    const button = new ButtonBuilder()
      .setLabel(this.i18n.t(locale, 'commands.bestFriendButtonLabel'))
      .setStyle(ButtonStyle.Link)
      .setURL(`${webUrl}/my/friends?guildId=${guildId}`);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  }

  private async renderCard(
    interaction: ChatInputCommandInteraction,
    result: BestFriendCardResponse,
    linkButtonRow: ActionRowBuilder<ButtonBuilder>,
  ): Promise<void> {
    if (!result.data) {
      return;
    }
    const imageBuffer = Buffer.from(result.data.imageBase64, 'base64');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'best-friends.png' });

    await interaction.editReply({
      files: [attachment],
      components: [linkButtonRow],
    });
  }
}
