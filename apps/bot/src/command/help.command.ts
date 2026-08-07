import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BRAND_INT } from '@onyu/shared';
import { CommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

import { BotI18nService } from '../common/application/bot-i18n.service';
import { LocaleResolverService } from '../common/application/locale-resolver.service';

/** WEB_URL 미설정 시 prod 도메인 (me.command.ts:20 관례) */
const DEFAULT_WEB_URL = 'https://onyu.dev';

/**
 * `/help`(`/도움말`) 슬래시 커맨드 — Onyu 주요 기능 요약 + 대시보드 링크 안내(F-GENERAL-006).
 * 전 사용자 실행 가능(defaultMemberPermissions 미지정). 관리자 + 길드 문맥일 때만
 * 시작 가이드 링크를 추가로 노출한다(UF-GENERAL-004).
 */
@Command({
  name: 'help',
  nameLocalizations: { ko: '도움말' },
  description: "Show a quick guide to Onyu's features",
  descriptionLocalizations: { ko: 'Onyu의 주요 기능과 도움말을 확인합니다' },
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
      // WEB_URL은 런타임에 읽는다 — 모듈 import 시점에 평가하면 ConfigModule의 .env 로드 전이라 fallback이 굳을 수 있다(me.command.ts:117 관례)
      const webUrl = process.env['WEB_URL'] ?? DEFAULT_WEB_URL;

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
