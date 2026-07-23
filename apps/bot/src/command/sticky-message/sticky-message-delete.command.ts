import { SlashCommandPipe } from '@discord-nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { StickyMessageDeleteDto } from './sticky-message-delete.dto';

@Command({
  name: 'sticky-delete',
  nameLocalizations: { ko: '고정메세지삭제' },
  description: 'Delete all sticky messages in the selected channel',
  descriptionLocalizations: { ko: '선택한 채널의 고정메세지를 모두 삭제합니다' },
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
})
@Injectable()
export class StickyMessageDeleteCommand {
  private readonly logger = new Logger(StickyMessageDeleteCommand.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onDelete(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe) _dto: StickyMessageDeleteDto,
  ): Promise<void> {
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

    const channel = interaction.options.getChannel('channel', true);

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await this.apiClient.deleteStickyMessageByChannel(guildId, channel.id);

      if (result.deletedCount === 0) {
        await interaction.editReply(
          this.i18n.t(locale, 'commands.stickyDeleteEmpty', { channelId: channel.id }),
        );
        return;
      }

      await interaction.editReply(
        this.i18n.t(locale, 'commands.stickyDeleteSuccess', {
          channelId: channel.id,
          count: result.deletedCount,
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : this.i18n.t(locale, 'errors.unknownError');
      this.logger.error('고정메세지 삭제 중 오류:', error);
      await interaction.editReply(this.i18n.t(locale, 'commands.stickyDeleteError', { message }));
    }
  }
}
