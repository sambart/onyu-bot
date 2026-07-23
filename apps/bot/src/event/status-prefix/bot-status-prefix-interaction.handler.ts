import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { type ButtonInteraction, type GuildMember, Interaction } from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { resolveResultMessage } from '../../common/application/message-code-map';

const CUSTOM_ID_PREFIX = {
  APPLY: 'status_prefix:',
  RESET: 'status_reset:',
} as const;

/**
 * Discord interactionCreate 이벤트를 수신하여 status_prefix/status_reset 버튼을 처리한다.
 * 비즈니스 로직은 API에 위임하고, 닉네임 변경과 Discord 응답은 Bot에서 직접 수행한다.
 */
@Injectable()
export class BotStatusPrefixInteractionHandler {
  private readonly logger = new Logger(BotStatusPrefixInteractionHandler.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @On('interactionCreate')
  async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    const isApply = customId.startsWith(CUSTOM_ID_PREFIX.APPLY);
    const isReset = customId.startsWith(CUSTOM_ID_PREFIX.RESET);
    if (!isApply && !isReset) return;
    if (!interaction.guildId) return;

    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    try {
      if (isApply) {
        await this.handleApply(interaction, customId, locale);
      } else {
        await this.handleReset(interaction, locale);
      }
    } catch (error) {
      this.logger.error(
        `[STATUS_PREFIX] Interaction failed: customId=${customId}`,
        error instanceof Error ? error.stack : error,
      );
      await this.replyError(interaction, locale);
    }
  }

  private async handleApply(
    interaction: ButtonInteraction,
    customId: string,
    locale: string,
  ): Promise<void> {
    const buttonId = parseInt(customId.slice(CUSTOM_ID_PREFIX.APPLY.length), 10);
    if (isNaN(buttonId)) {
      await interaction.reply({
        ephemeral: true,
        content: this.i18n.t(locale, 'errors.invalidRequest'),
      });
      return;
    }

    const guildId = interaction.guildId ?? '';
    const memberId = interaction.user.id;
    const member = interaction.member as GuildMember;

    const result = await this.apiClient.applyStatusPrefix({
      guildId,
      memberId,
      buttonId,
      currentDisplayName: member.displayName,
    });

    if (result.success && result.newNickname) {
      const canSetNickname = await this.setNickname(member, result.newNickname);
      if (!canSetNickname) {
        await interaction.reply({
          ephemeral: true,
          content: this.i18n.t(locale, 'errors.nicknamePermission'),
        });
        return;
      }
    }

    await interaction.reply({
      ephemeral: true,
      content: resolveResultMessage(this.i18n, locale, result),
    });
  }

  private async handleReset(interaction: ButtonInteraction, locale: string): Promise<void> {
    const guildId = interaction.guildId ?? '';
    const memberId = interaction.user.id;
    const member = interaction.member as GuildMember;

    const result = await this.apiClient.resetStatusPrefix({ guildId, memberId });

    if (result.success && result.originalNickname) {
      const canSetNickname = await this.setNickname(member, result.originalNickname);
      if (!canSetNickname) {
        await interaction.reply({
          ephemeral: true,
          content: this.i18n.t(locale, 'errors.nicknamePermission'),
        });
        return;
      }
    }

    await interaction.reply({
      ephemeral: true,
      content: resolveResultMessage(this.i18n, locale, result),
    });
  }

  /** 닉네임 변경 시도 후 성공 여부를 반환한다. */
  private async setNickname(member: GuildMember, nickname: string): Promise<boolean> {
    try {
      await member.setNickname(nickname);
      return true;
    } catch {
      return false;
    }
  }

  private async replyError(interaction: ButtonInteraction, locale: string): Promise<void> {
    const content = this.i18n.t(locale, 'errors.genericError');
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ ephemeral: true, content });
      } else {
        await interaction.reply({ ephemeral: true, content });
      }
    } catch {
      // Discord 응답 자체가 실패한 경우 무시
    }
  }
}
