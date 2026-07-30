import { SlashCommandPipe } from '@discord-nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { CanvasCardLocale } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  GuildMember,
} from 'discord.js';

import { BotI18nService } from '../common/application/bot-i18n.service';
import { LocaleResolverService } from '../common/application/locale-resolver.service';
import { MeCommandDto, MeViewOption } from './me.dto';

// 대시보드 기본 URL (WEB_URL 미설정 시 prod 도메인)
const DEFAULT_WEB_URL = 'https://onyu.dev';

// 버튼 customId — bot-me-interaction.handler.ts와 공유(F-VOICE-064/065)
const CUSTOM_ID_ACTIVITY_DETAIL = 'me:activity_detail';
const CUSTOM_ID_LEADERBOARD = 'me:leaderboard';

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
  async onMe(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe) dto: MeCommandDto,
  ): Promise<void> {
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

      const viewOption = dto.view === MeViewOption.Voice ? 'voice' : undefined;

      const result = await this.apiClient.getMeProfile({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        displayName,
        avatarUrl,
        viewOption,
        locale: this.toCanvasLocale(locale),
        // 옵션 없이 항상 자동 요청한다(F-VOICE-079 후속 개정) — 레이아웃 B(`보기:음성`)
        // 스킵과 쿼터 미소모는 API의 `effectiveMentType` 가드(D6)가 소유한다(A1, 판정
        // 중복 금지). 봇은 view를 선판정하지 않는다.
        mentType: 'analysis',
      });

      const buttonRow = this.buildButtonRow(interaction.guildId, locale, Boolean(result.data));

      if (!result.data) {
        await interaction.editReply({
          content: this.i18n.t(locale, 'commands.meNoActivity', { days: result.days }),
          components: [buttonRow],
        });
        return;
      }

      const imageBuffer = Buffer.from(result.data.imageBase64, 'base64');
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'profile.png' });

      await interaction.editReply({ files: [attachment], components: [buttonRow] });
    } catch (error) {
      this.logger.error('Me command error', error instanceof Error ? error.stack : String(error));
      await interaction.editReply({ content: this.i18n.t(locale, 'commands.meError') });
    }
  }

  /** LocaleResolverService는 'ko' | 'en' 중 하나만 반환하므로 안전하게 캔버스 카드 로케일로 변환한다(F-VOICE-082, best-friend.command.ts 선례) */
  private toCanvasLocale(locale: string): CanvasCardLocale {
    return locale === 'ko' ? 'ko' : 'en';
  }

  /**
   * 대시보드 링크(Link) 버튼 + (활동 데이터가 있을 때만) 서버 리더보드·활동 상세 버튼(F-VOICE-064/065).
   * 활동 없음(`hasData=false`) 시엔 조회할 데이터가 없으므로 Link 버튼만 표시(현행 유지).
   */
  private buildButtonRow(
    guildId: string,
    locale: string,
    hasData: boolean,
  ): ActionRowBuilder<ButtonBuilder> {
    // WEB_URL은 런타임에 읽는다 — 모듈 import 시점에 평가하면 ConfigModule의 .env 로드 전이라 fallback이 굳을 수 있다
    const webUrl = process.env['WEB_URL'] ?? DEFAULT_WEB_URL;
    const linkButton = new ButtonBuilder()
      .setLabel(this.i18n.t(locale, 'commands.meButtonLabel'))
      .setStyle(ButtonStyle.Link)
      .setURL(`${webUrl}/my/voice?guildId=${guildId}`);

    if (!hasData) {
      return new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton);
    }

    const leaderboardButton = new ButtonBuilder()
      .setCustomId(CUSTOM_ID_LEADERBOARD)
      .setLabel(this.i18n.t(locale, 'commands.meButtonLeaderboard'))
      .setStyle(ButtonStyle.Secondary);

    const activityDetailButton = new ButtonBuilder()
      .setCustomId(CUSTOM_ID_ACTIVITY_DETAIL)
      .setLabel(this.i18n.t(locale, 'commands.meButtonActivityDetail'))
      .setStyle(ButtonStyle.Primary);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      linkButton,
      leaderboardButton,
      activityDetailButton,
    );
  }
}
