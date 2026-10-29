import { SlashCommandPipe } from '@discord-nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { respondWithErrorNotice } from '../../common/util/interaction-response.util';
import { STICKY_DELETE_CUSTOM_ID } from '../../event/sticky-message/bot-sticky-delete-confirm.handler';
import { StickyMessageDeleteDto } from './sticky-message-delete.dto';

@Command({
  name: 'sticky-delete',
  nameLocalizations: { ko: '고정메세지삭제' },
  description: 'Delete all sticky messages in the selected channel',
  descriptionLocalizations: {
    ko: '선택한 채널의 고정메세지를 모두 삭제합니다',
    'pt-BR': 'Exclui todas as mensagens fixas do canal selecionado',
    ja: '選択したチャンネルの固定メッセージをすべて削除',
  },
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

    try {
      const channel = interaction.options.getChannel('channel', true);

      // 첫 응답도 try 안에 둔다 — 밖이면 실패 시 "응답 없음"(감사 A12)
      await interaction.deferReply({ ephemeral: true });

      const configsResponse = await this.apiClient.getStickyMessageConfigs(guildId);
      const count = (configsResponse.data ?? []).filter(
        (config) => config.channelId === channel.id,
      ).length;

      if (count === 0) {
        await interaction.editReply(
          this.i18n.t(locale, 'commands.stickyDeleteEmpty', { channelId: channel.id }),
        );
        return;
      }

      const userId = interaction.user.id;
      const confirmButton = new ButtonBuilder()
        .setCustomId(`${STICKY_DELETE_CUSTOM_ID.CONFIRM}${channel.id}:${userId}`)
        .setLabel(this.i18n.t(locale, 'commands.stickyDeleteConfirmButton'))
        .setStyle(ButtonStyle.Danger);
      const cancelButton = new ButtonBuilder()
        .setCustomId(`${STICKY_DELETE_CUSTOM_ID.CANCEL}${channel.id}:${userId}`)
        .setLabel(this.i18n.t(locale, 'commands.stickyDeleteCancelButton'))
        .setStyle(ButtonStyle.Secondary);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton);

      await interaction.editReply({
        content: this.i18n.t(locale, 'commands.stickyDeleteConfirm', {
          channelId: channel.id,
          count,
        }),
        components: [row],
      });
    } catch (error) {
      // error.message(내부 IP·영문 타임아웃 등)는 사용자에게 노출하지 않는다 — 로그에만 남긴다
      this.logger.error('고정메세지 삭제 확인 조회 중 오류:', error);
      await respondWithErrorNotice(
        interaction,
        this.i18n.t(locale, 'commands.stickyDeleteError'),
        this.logger,
      );
    }
  }
}
