import { SlashCommandPipe } from '@discord-nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { CanvasCardLocale } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import { AttachmentBuilder, ChatInputCommandInteraction } from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { isGuildAdmin } from './guild-admin';
import { LeaderboardCommandDto } from './leaderboard.dto';
import { buildPageButtonRow } from './leaderboard-buttons';

/** 봇 표면 전용 기본 페이지 크기(F-LVL-26) — API가 상한 25로 clamp한다 */
const LEADERBOARD_LIMIT = 10;
/** `page` 옵션 미지정 시 기본 페이지 */
const DEFAULT_PAGE = 1;

@Command({
  name: 'leaderboard',
  nameLocalizations: { ko: '랭킹' },
  description: 'Show the server level leaderboard',
  descriptionLocalizations: { ko: '서버 레벨 리더보드를 보여줍니다' },
})
@Injectable()
export class LeaderboardCommand {
  private readonly logger = new Logger(LeaderboardCommand.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onLeaderboard(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe) _dto: LeaderboardCommandDto,
  ): Promise<void> {
    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: this.i18n.t(locale, 'errors.guildOnly'),
        ephemeral: true,
      });
      return;
    }

    // F2 — base 이름(page)으로 조회한다.
    const page = interaction.options.getInteger('page') ?? DEFAULT_PAGE;

    // 공개 응답(비-ephemeral) 고정
    await interaction.deferReply();

    try {
      const result = await this.apiClient.getLevelLeaderboardCard({
        guildId,
        page,
        limit: LEADERBOARD_LIMIT,
        viewerUserId: interaction.user.id,
        locale: this.toCanvasLocale(locale),
        requesterUserId: interaction.user.id,
        requesterIsGuildAdmin: isGuildAdmin(interaction),
      });

      if (!result.ok) {
        await interaction.editReply({ content: this.i18n.t(locale, 'commands.leaderboardError') });
        return;
      }

      if (!result.isEnabled) {
        await interaction.editReply({
          content: this.i18n.t(locale, 'commands.leaderboardDisabled'),
        });
        return;
      }

      // U10 — 가시성 거부는 서버 판정 결과다(200 정상 응답, 예외 아님). isEnabled 조기 반환
      // 다음, 데이터 없음 판정보다 앞에 둔다(서버가 이미 total=0/data=null로 응답하므로 순서
      // 자체는 결과에 영향 없으나 "관리자 전용" 문구가 "활동 없음" 문구보다 우선해야 한다).
      if (!result.visible) {
        await interaction.editReply({
          content: this.i18n.t(locale, 'commands.leaderboardAdminOnly'),
        });
        return;
      }

      if (!result.data) {
        // total===0(활동 0명)과 범위 초과 페이지를 사유별로 구분한다(UF-LEVEL-029 처리1·2)
        const key =
          result.total === 0 ? 'commands.leaderboardEmpty' : 'commands.leaderboardOutOfRange';
        await interaction.editReply({ content: this.i18n.t(locale, key) });
        return;
      }

      const imageBuffer = Buffer.from(result.data.imageBase64, 'base64');
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' });
      const buttonRow = buildPageButtonRow({
        guildId,
        page: result.page,
        totalPages: result.totalPages,
        locale,
        i18n: this.i18n,
      });

      await interaction.editReply({ files: [attachment], components: [buttonRow] });
    } catch (error) {
      this.logger.error(
        'Leaderboard command error',
        error instanceof Error ? error.stack : String(error),
      );
      await interaction.editReply({ content: this.i18n.t(locale, 'commands.leaderboardError') });
    }
  }

  /** LocaleResolverService는 'ko' | 'en' 중 하나만 반환하므로 안전하게 캔버스 카드 로케일로 변환한다 */
  private toCanvasLocale(locale: string): CanvasCardLocale {
    return locale === 'ko' ? 'ko' : 'en';
  }
}
