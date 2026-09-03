import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import type { BotI18nService } from '../../common/application/bot-i18n.service';

/**
 * [이전]/[다음] 페이지 버튼 customId 접두어(F-LVL-26, PRD 확정 문자열).
 * 전체 형태: `rank:prev:{guildId}:{page}` / `rank:next:{guildId}:{page}`.
 * 파싱은 `lastIndexOf(':')` 방식을 쓴다(`bot-newbie-interaction.handler.ts`의 moco 관례 준용).
 */
export const RANK_BUTTON_CUSTOM_ID_PREFIX = {
  PREV: 'rank:prev:',
  NEXT: 'rank:next:',
} as const;

export interface BuildPageButtonRowParams {
  guildId: string;
  /** 현재(방금 렌더된) 페이지 — API 응답의 page를 그대로 쓴다 */
  page: number;
  totalPages: number;
  locale: string;
  i18n: BotI18nService;
}

/**
 * 리더보드 보드 카드의 [이전]/[다음] 버튼 행을 조립한다(S7). `leaderboard.command.ts`와
 * `bot-level-interaction.handler.ts` 양쪽이 이 순수 함수를 공유해 로직 이중 구현을 막는다
 * (UC-07 TC-07-15). 버튼 조립은 봇이 소유한다 — API는 discord.js 컴포넌트 직렬화에
 * 의존하지 않는다(moco 방식과의 차이점, 계획 §2 S7 근거).
 *
 * 경계 비활성: 첫 페이지에서 [이전], 마지막 페이지에서 [다음]을 비활성화해 범위 초과 호출
 * 자체를 막는다(UF-LEVEL-028).
 */
export function buildPageButtonRow(
  params: BuildPageButtonRowParams,
): ActionRowBuilder<ButtonBuilder> {
  const { guildId, page, totalPages, locale, i18n } = params;

  const prevButton = new ButtonBuilder()
    .setCustomId(`${RANK_BUTTON_CUSTOM_ID_PREFIX.PREV}${guildId}:${page}`)
    .setLabel(i18n.t(locale, 'commands.leaderboardPrevLabel'))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page <= 1);

  const nextButton = new ButtonBuilder()
    .setCustomId(`${RANK_BUTTON_CUSTOM_ID_PREFIX.NEXT}${guildId}:${page}`)
    .setLabel(i18n.t(locale, 'commands.leaderboardNextLabel'))
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton);
}
