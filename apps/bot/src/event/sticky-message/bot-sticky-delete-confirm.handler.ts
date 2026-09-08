import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { type ButtonInteraction, type Interaction, PermissionFlagsBits } from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';

/**
 * `/고정메세지삭제` 확인 버튼 customId 접두사(W7, docs/plans/admin-action-guard-fixes.md §8).
 * `sticky-message-delete.command.ts` 와 공유한다 — 정본은 이 파일.
 */
export const STICKY_DELETE_CUSTOM_ID = {
  PREFIX: 'sticky_delete:',
  CONFIRM: 'sticky_delete:confirm:',
  CANCEL: 'sticky_delete:cancel:',
} as const;

interface ParsedStickyDeleteCustomId {
  op: 'confirm' | 'cancel';
  channelId: string;
  userId: string;
}

/**
 * `/고정메세지삭제` 확인/취소 버튼(F-STICKY-014) 처리 — stateless `@On('interactionCreate')`
 * 핸들러. `awaitMessageComponent` 컬렉터가 아니라 독립 핸들러로 두는 이유: 컬렉터는 봇 재시작 시
 * 죽어 버튼이 영구 무응답이 되고, customId 에 채널·유저를 실어 본인만 클릭 가능하게 하는 요건은
 * stateless 핸들러가 그대로 만족한다. `guildId` 는 customId 에 넣지 않고 항상
 * `interaction.guildId`(신뢰 소스)를 쓴다(§6 과 동일 원칙).
 */
@Injectable()
export class BotStickyDeleteConfirmHandler {
  private readonly logger = new Logger(BotStickyDeleteConfirmHandler.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @On('interactionCreate')
  async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith(STICKY_DELETE_CUSTOM_ID.PREFIX)) return;
    if (!interaction.guildId) return;

    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    const parsed = this.parseCustomId(interaction.customId);
    if (!parsed) {
      await interaction.reply({
        ephemeral: true,
        content: this.i18n.t(locale, 'errors.invalidRequest'),
      });
      return;
    }

    if (interaction.user.id !== parsed.userId) {
      await interaction.reply({
        ephemeral: true,
        content: this.i18n.t(locale, 'errors.invalidRequest'),
      });
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        ephemeral: true,
        content: this.i18n.t(locale, 'errors.manageGuildOnly'),
      });
      return;
    }

    if (parsed.op === 'cancel') {
      await interaction.update({
        content: this.i18n.t(locale, 'commands.stickyDeleteCancelled'),
        components: [],
      });
      return;
    }

    await this.handleConfirm(interaction, parsed.channelId, interaction.guildId, locale);
  }

  private async handleConfirm(
    interaction: ButtonInteraction,
    channelId: string,
    guildId: string,
    locale: string,
  ): Promise<void> {
    await interaction.deferUpdate();

    try {
      const result = await this.apiClient.deleteStickyMessageByChannel(guildId, channelId);

      if (result.deletedCount === 0) {
        await interaction.editReply({
          content: this.i18n.t(locale, 'commands.stickyDeleteEmpty', { channelId }),
          components: [],
        });
        return;
      }

      await interaction.editReply({
        content: this.i18n.t(locale, 'commands.stickyDeleteSuccess', {
          channelId,
          count: result.deletedCount,
        }),
        components: [],
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : this.i18n.t(locale, 'errors.unknownError');
      this.logger.error('고정메세지 삭제 확인 처리 중 오류:', error);
      await interaction.editReply({
        content: this.i18n.t(locale, 'commands.stickyDeleteError', { message }),
        components: [],
      });
    }
  }

  private parseCustomId(customId: string): ParsedStickyDeleteCustomId | null {
    const isConfirm = customId.startsWith(STICKY_DELETE_CUSTOM_ID.CONFIRM);
    const isCancel = customId.startsWith(STICKY_DELETE_CUSTOM_ID.CANCEL);
    if (!isConfirm && !isCancel) return null;

    const prefix = isConfirm ? STICKY_DELETE_CUSTOM_ID.CONFIRM : STICKY_DELETE_CUSTOM_ID.CANCEL;
    const parts = customId.slice(prefix.length).split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

    return { op: isConfirm ? 'confirm' : 'cancel', channelId: parts[0], userId: parts[1] };
  }
}
