import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { CommandInteraction, PermissionFlagsBits } from 'discord.js';

import { BotI18nService } from '../common/application/bot-i18n.service';
import { LocaleResolverService } from '../common/application/locale-resolver.service';

@Command({
  name: 'voice-flush',
  description: 'Force-flush voice aggregation data to the database (admin only)',
  descriptionLocalizations: { ko: '음성 채널 집계 데이터를 강제로 DB에 반영합니다 (관리자 전용)' },
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
@Injectable()
export class VoiceFlushCommand {
  private readonly logger = new Logger(VoiceFlushCommand.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onVoiceFlush(@InteractionEvent() interaction: CommandInteraction): Promise<void> {
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

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: this.i18n.t(locale, 'errors.adminOnly'),
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await this.apiClient.voiceFlush();

      await interaction.editReply({
        content: this.i18n.t(locale, 'commands.voiceFlushResult', {
          flushed: result.flushed,
          skipped: result.skipped,
        }),
      });

      this.logger.log(
        `[VOICE FLUSH] by ${interaction.user.tag} — flushed=${result.flushed} skipped=${result.skipped}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : this.i18n.t(locale, 'errors.unknownError');
      await interaction.editReply({
        content: this.i18n.t(locale, 'commands.voiceFlushFailed', { message }),
      });
    }
  }
}
