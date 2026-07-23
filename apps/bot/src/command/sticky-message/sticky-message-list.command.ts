import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { Colors, CommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';

@Command({
  name: 'sticky-list',
  nameLocalizations: { ko: '고정메세지목록' },
  description: 'View the list of sticky messages in this server',
  descriptionLocalizations: { ko: '이 서버의 고정메세지 목록을 확인합니다' },
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
})
@Injectable()
export class StickyMessageListCommand {
  private readonly logger = new Logger(StickyMessageListCommand.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onList(@InteractionEvent() interaction: CommandInteraction): Promise<void> {
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

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await this.apiClient.getStickyMessageConfigs(guildId);
      const configs = result.data ?? [];

      if (configs.length === 0) {
        await interaction.editReply(this.i18n.t(locale, 'commands.stickyListEmpty'));
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(this.i18n.t(locale, 'commands.stickyListTitle'))
        .setColor(Colors.Blue)
        .setFooter({
          text: this.i18n.t(locale, 'commands.stickyListFooter', { count: configs.length }),
        })
        .setTimestamp();

      configs.slice(0, 25).forEach((config, index) => {
        embed.addFields({
          name: `#${index + 1} <#${config.channelId}>`,
          value: [
            this.i18n.t(locale, 'commands.stickyListTitleField', {
              title: config.embedTitle ?? this.i18n.t(locale, 'commands.stickyListNoTitle'),
            }),
            this.i18n.t(locale, 'commands.stickyListEnabledField', {
              status: config.enabled
                ? this.i18n.t(locale, 'commands.stickyListOn')
                : this.i18n.t(locale, 'commands.stickyListOff'),
            }),
          ].join('\n'),
          inline: false,
        });
      });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : this.i18n.t(locale, 'errors.unknownError');
      this.logger.error('고정메세지 목록 조회 중 오류:', error);
      await interaction.editReply(this.i18n.t(locale, 'commands.stickyListError', { message }));
    }
  }
}
