import type { Logger } from '@nestjs/common';
import type { BotApiClientService, MeRecapBotResponse } from '@onyu/bot-api-client';
import {
  getRecapWindowPhase,
  parseLocale,
  RECAP_YEAR,
  type RecapWindowPhase,
  resolveRecapNow as resolveRecapNowShared,
} from '@onyu/shared';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';

import type { BotI18nService } from '../common/application/bot-i18n.service';

/**
 * `/me 보기:결산`(연말 결산 카드) 처리 함수군 — `MeCommand` 가 `deferReply` 앞에서 위임한다.
 * 기존 profile 경로(`me-profile-card.ts`)와 라우트·쿼터(me-ment)가 분리돼 있으므로 이 파일은
 * 프로필 경로를 호출하지 않는다.
 */

// 대시보드 기본 URL (WEB_URL 미설정 시 prod 도메인) — me-profile-card.ts 와 동일 폴백
const DEFAULT_WEB_URL = 'https://onyu.dev';
const RECAP_ATTACHMENT_NAME = 'recap.png';
const RECAP_PAGE_PATH = '/my/recap';
const PRODUCTION_ENV = 'production';
const AVATAR_SIZE = 128;

/** QA 시각 오버라이드(P-51) 환경변수 — production 에서는 무시한다 */
export const RECAP_NOW_OVERRIDE_ENV = 'RECAP_NOW_OVERRIDE';

/**
 * 현재 시각을 반환한다. `NODE_ENV !== 'production'` 이고 `RECAP_NOW_OVERRIDE`(ISO)가 유효할 때만
 * 오버라이드 값을 쓴다(P-51 — 프리즈 후 노출이라 사전 스모크 수단 필요).
 */
export function resolveRecapNow(): Date {
  return resolveRecapNowShared(process.env[RECAP_NOW_OVERRIDE_ENV], isProductionEnv());
}

function isProductionEnv(): boolean {
  return process.env['NODE_ENV'] === PRODUCTION_ENV;
}

/** 창 밖 단계(시작 전/종료)에 해당하는 안내 문구 */
export function buildRecapWindowNotice(
  i18n: BotI18nService,
  locale: string,
  phase: Exclude<RecapWindowPhase, 'open'>,
): string {
  const key = phase === 'not_started' ? 'commands.meRecapNotStarted' : 'commands.meRecapEnded';
  return i18n.t(locale, key);
}

/** 결산 페이지 Link 버튼 행 — customId 없는 Link 버튼만 사용한다 */
export function buildRecapButtonRow(
  i18n: BotI18nService,
  locale: string,
  guildId: string,
): ActionRowBuilder<ButtonBuilder> {
  // WEB_URL 은 런타임에 읽는다 — 모듈 import 시점에 평가하면 .env 로드 전 폴백이 굳을 수 있다
  const webUrl = process.env['WEB_URL'] ?? DEFAULT_WEB_URL;
  const linkButton = new ButtonBuilder()
    .setLabel(i18n.t(locale, 'commands.meRecapButtonLabel'))
    .setStyle(ButtonStyle.Link)
    .setURL(`${webUrl}${RECAP_PAGE_PATH}?guildId=${guildId}`);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton);
}

type RecapSummary = NonNullable<MeRecapBotResponse['summary']>;

/** 히어로 단위별 한 줄 요약. 활동 유형 라벨이 없으면 해당 구간을 생략한다. */
export function buildRecapSummaryContent(
  i18n: BotI18nService,
  locale: string,
  summary: RecapSummary,
): string {
  const keyByUnit = {
    hour: 'commands.meRecapSummaryHours',
    minute: 'commands.meRecapSummaryMinutes',
    message: 'commands.meRecapSummaryMessages',
  } as const;
  const formattedValue = new Intl.NumberFormat(locale).format(summary.hero.value);
  const typeLabel = summary.activityTypeLabel ?? '';
  const line = i18n.t(locale, keyByUnit[summary.hero.unit], {
    year: summary.year,
    value: formattedValue,
    type: typeLabel,
  });
  // 라벨이 없으면 템플릿 끝의 " · " 구분자만 남으므로 제거한다
  return typeLabel ? line : line.replace(/\s*·\s*$/, '');
}

/** ready 응답 페이로드(공개 PNG + 한 줄 요약 + Link 버튼). 이미지가 없으면 null. */
export function buildRecapReadyReply(params: {
  i18n: BotI18nService;
  locale: string;
  guildId: string;
  result: MeRecapBotResponse;
}): {
  content: string;
  files: AttachmentBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} | null {
  const { i18n, locale, guildId, result } = params;
  if (!result.ok || result.status !== 'ready' || !result.data || !result.summary) {
    return null;
  }
  const imageBuffer = Buffer.from(result.data.imageBase64, 'base64');
  return {
    content: buildRecapSummaryContent(i18n, locale, result.summary),
    files: [new AttachmentBuilder(imageBuffer, { name: RECAP_ATTACHMENT_NAME })],
    components: [buildRecapButtonRow(i18n, locale, guildId)],
  };
}

/** ready 가 아닌 B1 응답(empty·경계 경합·실패)에 대한 ephemeral 안내 문구 */
export function resolveRecapFallbackNotice(
  i18n: BotI18nService,
  locale: string,
  result: MeRecapBotResponse,
): string {
  if (result.ok && result.status === 'empty') return i18n.t(locale, 'commands.meRecapEmpty');
  if (result.ok && (result.status === 'not_started' || result.status === 'ended')) {
    return buildRecapWindowNotice(i18n, locale, result.status);
  }
  return i18n.t(locale, 'commands.meRecapError');
}

interface HandleRecapViewParams {
  interaction: ChatInputCommandInteraction;
  apiClient: BotApiClientService;
  i18n: BotI18nService;
  locale: string;
  logger: Logger;
}

/** defer 로 남은 "생각 중" 응답을 지우고 ephemeral 후속 안내를 보낸다(deleteReply 실패는 warn) */
async function replaceWithEphemeralNotice(
  interaction: ChatInputCommandInteraction,
  logger: Logger,
  content: string,
): Promise<void> {
  try {
    await interaction.deleteReply();
  } catch (error) {
    logger.warn(
      `Recap deleteReply failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  await interaction.followUp({ content, ephemeral: true });
}

/**
 * `/me 보기:결산` 본 처리. `interaction.guildId` 는 호출부가 보장한다.
 * 창 밖이면 API·defer 없이 ephemeral reply 하고, 창 안이면 B1 을 호출해 공개 카드로 응답한다.
 */
export async function handleRecapView(params: HandleRecapViewParams): Promise<void> {
  const { interaction, apiClient, i18n, locale, logger } = params;
  const guildId = interaction.guildId;
  if (!guildId) return;

  const phase = getRecapWindowPhase(resolveRecapNow(), RECAP_YEAR);
  if (phase !== 'open') {
    await interaction.reply({
      content: buildRecapWindowNotice(i18n, locale, phase),
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    // 캐시 미적재 시 member 는 API 원시 객체(displayName 없음)일 수 있어 in 가드로 좁힌다.
    const { member } = interaction;
    const displayName =
      member && 'displayName' in member ? member.displayName : interaction.user.displayName;
    const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: AVATAR_SIZE });

    const result = await apiClient.getRecapCard({
      guildId,
      userId: interaction.user.id,
      displayName,
      avatarUrl,
      locale: parseLocale(locale),
    });

    const ready = buildRecapReadyReply({ i18n, locale, guildId, result });
    if (ready) {
      await interaction.editReply(ready);
      return;
    }
    await replaceWithEphemeralNotice(
      interaction,
      logger,
      resolveRecapFallbackNotice(i18n, locale, result),
    );
  } catch (error) {
    logger.error('Me recap error', error instanceof Error ? error.stack : String(error));
    await replaceWithEphemeralNotice(interaction, logger, i18n.t(locale, 'commands.meRecapError'));
  }
}
