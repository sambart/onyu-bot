import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BRAND_INT } from '@onyu/shared';
import { CommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

import { BotI18nService } from '../common/application/bot-i18n.service';
import { LocaleResolverService } from '../common/application/locale-resolver.service';
import { getWebUrl } from '../common/util/web-url.util';

/**
 * `/help`(`/도움말`) 슬래시 커맨드 — Onyu 주요 기능 요약 + 대시보드 링크 안내(F-GENERAL-006).
 * 전 사용자 실행 가능(defaultMemberPermissions 미지정). 관리자 + 길드 문맥일 때만
 * 시작 가이드 링크를 추가로 노출한다(UF-GENERAL-004).
 */
@Command({
  name: 'help',
  nameLocalizations: { ko: '도움말' },
  description: "Show a quick guide to Onyu's features",
  descriptionLocalizations: {
    ko: 'Onyu의 주요 기능과 도움말을 확인합니다',
    'pt-BR': 'Mostra um guia rápido dos recursos do Onyu',
    ja: 'Onyuの主な機能とヘルプを表示',
  },
})
@Injectable()
export class HelpCommand {
  private readonly logger = new Logger(HelpCommand.name);

  constructor(
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onHelp(@InteractionEvent() interaction: CommandInteraction): Promise<void> {
    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    try {
      const webUrl = getWebUrl();

      const lines = [
        this.i18n.t(locale, 'commands.helpIntro'),
        this.i18n.t(locale, 'commands.helpFeatures'),
        this.i18n.t(locale, 'commands.helpDashboardLink', { url: `${webUrl}/select-guild` }),
      ];

      if (
        interaction.guildId &&
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
      ) {
        lines.push(
          this.i18n.t(locale, 'commands.helpGettingStartedLink', {
            url: `${webUrl}/dashboard/guild/${interaction.guildId}/getting-started`,
          }),
        );
      }

      const embed = new EmbedBuilder()
        .setTitle(this.i18n.t(locale, 'commands.helpTitle'))
        .setDescription(lines.join('\n\n'))
        .setColor(BRAND_INT);

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      this.logger.error('Help command error', error instanceof Error ? error.stack : String(error));
      await interaction.reply({
        content: this.i18n.t(locale, 'errors.genericError'),
        ephemeral: true,
      });
    }
  }
}
