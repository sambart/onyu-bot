import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { AttachmentBuilder, CommandInteraction, GuildMember } from 'discord.js';

import { BotI18nService } from '../common/application/bot-i18n.service';
import { LocaleResolverService } from '../common/application/locale-resolver.service';

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

      if (!result.data) {
        await interaction.editReply({
          content: this.i18n.t(locale, 'commands.meNoActivity', { days: result.days }),
        });
        return;
      }

      const imageBuffer = Buffer.from(result.data.imageBase64, 'base64');
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'profile.png' });

      await interaction.editReply({ files: [attachment] });
    } catch (error) {
      this.logger.error('Me command error', error instanceof Error ? error.stack : String(error));
      await interaction.editReply({ content: this.i18n.t(locale, 'commands.meError') });
    }
  }
}
