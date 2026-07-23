import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  GuildMember,
} from 'discord.js';

import { BotI18nService } from '../common/application/bot-i18n.service';
import { LocaleResolverService } from '../common/application/locale-resolver.service';

// 대시보드 기본 URL (WEB_URL 미설정 시 prod 도메인)
const DEFAULT_WEB_URL = 'https://onyu.dev';

@Command({
  name: 'me',
  nameLocalizations: { ko: '미' },
  description: 'View your profile and voice activity',
  descriptionLocalizations: { ko: '내 프로필과 음성 활동을 확인합니다' },
})
@Injectable()
export class MeCommand {
  private readonly logger = new Logger(MeCommand.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onMe(@InteractionEvent() interaction: CommandInteraction): Promise<void> {
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

    await interaction.deferReply();

    try {
      const displayName =
        (interaction.member as GuildMember)?.displayName ?? interaction.user.displayName;
      const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });

      const result = await this.apiClient.getMeProfile(
        interaction.guildId,
        interaction.user.id,
        displayName,
        avatarUrl,
      );

      const linkButtonRow = this.buildLinkButtonRow(interaction.guildId, locale);

      if (!result.data) {
        await interaction.editReply({
          content: this.i18n.t(locale, 'commands.meNoActivity', { days: result.days }),
          components: [linkButtonRow],
        });
        return;
      }

      const imageBuffer = Buffer.from(result.data.imageBase64, 'base64');
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'profile.png' });

      await interaction.editReply({ files: [attachment], components: [linkButtonRow] });
    } catch (error) {
      this.logger.error('Me command error', error instanceof Error ? error.stack : String(error));
      await interaction.editReply({ content: this.i18n.t(locale, 'commands.meError') });
    }
  }

  private buildLinkButtonRow(guildId: string, locale: string): ActionRowBuilder<ButtonBuilder> {
    // WEB_URL은 런타임에 읽는다 — 모듈 import 시점에 평가하면 ConfigModule의 .env 로드 전이라 fallback이 굳을 수 있다
    const webUrl = process.env['WEB_URL'] ?? DEFAULT_WEB_URL;
    const button = new ButtonBuilder()
      .setLabel(this.i18n.t(locale, 'commands.meButtonLabel'))
      .setStyle(ButtonStyle.Link)
      .setURL(`${webUrl}/my/voice?guildId=${guildId}`);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  }
}
