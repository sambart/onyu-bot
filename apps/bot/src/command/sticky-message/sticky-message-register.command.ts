import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandInteraction, PermissionFlagsBits } from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';

@Command({
  name: 'sticky-register',
  nameLocalizations: { ko: '고정메세지등록' },
  description: 'Register sticky messages in the web dashboard',
  descriptionLocalizations: { ko: '고정메세지를 웹 대시보드에서 등록합니다' },
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
})
@Injectable()
export class StickyMessageRegisterCommand {
  private readonly logger = new Logger(StickyMessageRegisterCommand.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onRegister(@InteractionEvent() interaction: CommandInteraction): Promise<void> {
    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: this.i18n.t(locale, 'errors.manageGuildOnly'),
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: this.i18n.t(locale, 'errors.guildOnly'),
        ephemeral: true,
      });
      return;
    }

    const webUrl = this.configService.get<string>('WEB_URL', 'http://localhost:4000');
    const settingsUrl = `${webUrl}/settings/guild/${guildId}/sticky-message`;

    await interaction.reply({
      content: this.i18n.t(locale, 'commands.stickyRegisterGuide', { url: settingsUrl }),
      ephemeral: true,
    });
  }
}
