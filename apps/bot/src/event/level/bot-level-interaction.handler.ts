import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { CanvasCardLocale, LevelLeaderboardCardResponse } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import { DEFAULT_LOCALE } from '@onyu/shared';
import { type ButtonInteraction, type Interaction } from 'discord.js';

import {
  buildPageButtonRow,
  RANK_BUTTON_CUSTOM_ID_PREFIX,
} from '../../command/level/leaderboard-buttons';
import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';

/** `/랭킹` 버튼 경로 전용 페이지 크기 — 커맨드(leaderboard.command.ts)와 동일 값을 유지한다 */
const LEADERBOARD_LIMIT = 10;

/**
 * `/랭킹` 보드 카드의 [이전]/[다음] 버튼(S7, F-LVL-26) interactionCreate 이벤트를 처리한다.
 * `bot-newbie-interaction.handler.ts`의 moco prev/next 패턴(고정 접두어 + `lastIndexOf(':')`
 * 파싱)을 준용하되, 버튼 재조립은 봇이 직접 수행한다(`leaderboard-buttons.ts` 공유 — moco의
 * API-직렬화-components 방식은 채택하지 않는다, 계획 §2 S7 근거).
 */
@Injectable()
export class BotLevelInteractionHandler {
  private readonly logger = new Logger(BotLevelInteractionHandler.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @On('interactionCreate')
  async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    const isPrev = customId.startsWith(RANK_BUTTON_CUSTOM_ID_PREFIX.PREV);
    const isNext = customId.startsWith(RANK_BUTTON_CUSTOM_ID_PREFIX.NEXT);
    if (!isPrev && !isNext) return;

    // DM 컨텍스트 차단 — 보드 카드는 길드 채널 게시물이므로 DM 클릭은 불가하나 방어(bot-me-interaction.handler.ts 관례)
    if (!interaction.guildId) return;

    // localeResolver.resolve()는 내부에서 실패를 삼키고 항상 값을 반환하므로 여기서 채워지지
    // 않는 경우는 사실상 없으나, catch 블록에서 ephemeral 안내 문구 로케일로 안전하게 사용하기
    // 위해 기본값을 미리 둔다.
    let locale: string = DEFAULT_LOCALE;

    try {
      const prefix = isPrev ? RANK_BUTTON_CUSTOM_ID_PREFIX.PREV : RANK_BUTTON_CUSTOM_ID_PREFIX.NEXT;
      const { guildId, currentPage } = this.parseCustomId(customId, prefix);
      const targetPage = isPrev ? currentPage - 1 : currentPage + 1;

      locale = await this.localeResolver.resolve(
        interaction.user.id,
        interaction.guildId,
        interaction.locale,
      );

      await interaction.deferUpdate();

      const result = await this.apiClient.getLevelLeaderboardCard({
        guildId,
        page: targetPage,
        limit: LEADERBOARD_LIMIT,
        viewerUserId: interaction.user.id,
        locale: this.toCanvasLocale(locale),
      });

      await this.applyResponse(interaction, result, guildId, locale);
    } catch (error) {
      // API 일시 장애/타임아웃/만료된 인터랙션 등 — 채널에 게시된 카드+버튼은 그대로 두고
      // 클릭한 사용자에게만 ephemeral 안내를 시도한다(EC-RANK-24, bot-newbie-interaction.handler.ts 관례).
      this.logger.error(
        `[LEVEL] Interaction failed: customId=${customId}`,
        error instanceof Error ? error.stack : error,
      );
      await this.notifyEphemeralError(interaction, locale);
    }
  }

  /** `rank:prev|next:{guildId}:{page}`를 파싱한다 — 접두어 제거 후 마지막 콜론 기준 분리 */
  private parseCustomId(
    customId: string,
    prefix: string,
  ): { guildId: string; currentPage: number } {
    const rest = customId.slice(prefix.length);
    const lastColon = rest.lastIndexOf(':');
    const guildId = rest.slice(0, lastColon);
    const currentPage = parseInt(rest.slice(lastColon + 1), 10);
    return { guildId, currentPage };
  }

  private async applyResponse(
    interaction: ButtonInteraction,
    result: LevelLeaderboardCardResponse,
    guildId: string,
    locale: string,
  ): Promise<void> {
    if (!result.ok) {
      // API 렌더 실패는 HTTP 200 + ok:false로 내려오는 일시 장애(설계 의도) — 채널에 게시된
      // 카드+버튼은 그대로 두고 클릭한 사용자에게만 ephemeral로 안내한다(§요구동작, EC-RANK-03과
      // 구분되는 경로: isEnabled/data-empty는 확정적 상태라 editToText를 유지한다).
      await this.notifyEphemeralError(interaction, locale);
      return;
    }

    if (!result.isEnabled) {
      await this.editToText(interaction, this.i18n.t(locale, 'commands.leaderboardDisabled'));
      return;
    }

    if (!result.data) {
      const key =
        result.total === 0 ? 'commands.leaderboardEmpty' : 'commands.leaderboardOutOfRange';
      await this.editToText(interaction, this.i18n.t(locale, key));
      return;
    }

    const imageBuffer = Buffer.from(result.data.imageBase64, 'base64');
    const buttonRow = buildPageButtonRow({
      guildId,
      page: result.page,
      totalPages: result.totalPages,
      locale,
      i18n: this.i18n,
    });

    await interaction.message.edit({
      content: '',
      embeds: [],
      files: [{ attachment: imageBuffer, name: 'leaderboard.png' }],
      components: [buttonRow],
    });
  }

  /** 빈 상태 전환(EC-RANK-03/UF-LEVEL-029 처리4) — 텍스트 안내로 교체하고 버튼을 제거한다 */
  private async editToText(interaction: ButtonInteraction, content: string): Promise<void> {
    await interaction.message.edit({ content, embeds: [], files: [], components: [] });
  }

  /**
   * 일시 실패(API ok:false / 호출 예외·타임아웃) 시 채널에 게시된 카드+버튼은 건드리지 않고
   * 클릭한 사용자에게만 ephemeral로 안내한다. handle()에서 이미 `deferUpdate()`로 ack했다면
   * `followUp`을, ack 이전에 실패했다면 `reply`를 사용한다(bot-newbie-interaction.handler.ts
   * catch 블록 관례 준용). 안내 전송 자체가 실패(만료된 인터랙션 등)해도 조용히 로그만 남긴다.
   */
  private async notifyEphemeralError(
    interaction: ButtonInteraction,
    locale: string,
  ): Promise<void> {
    try {
      const content = this.i18n.t(locale, 'commands.leaderboardError');
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ ephemeral: true, content });
      } else {
        await interaction.reply({ ephemeral: true, content });
      }
    } catch (notifyError) {
      this.logger.error(
        '[LEVEL] Failed to send ephemeral error notice',
        notifyError instanceof Error ? notifyError.stack : notifyError,
      );
    }
  }

  /** LocaleResolverService는 'ko' | 'en' 중 하나만 반환하므로 안전하게 캔버스 카드 로케일로 변환한다 */
  private toCanvasLocale(locale: string): CanvasCardLocale {
    return locale === 'ko' ? 'ko' : 'en';
  }
}
