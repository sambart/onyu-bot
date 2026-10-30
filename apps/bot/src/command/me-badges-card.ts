import type { Logger } from '@nestjs/common';
import type { BotApiClientService, MeBadgesBotResponse } from '@onyu/bot-api-client';
import { parseLocale } from '@onyu/shared';
import { AttachmentBuilder, type ChatInputCommandInteraction } from 'discord.js';

import type { BotI18nService } from '../common/application/bot-i18n.service';
import { replaceWithEphemeralNotice } from './me-recap-card';

/**
 * `/me 보기:뱃지`(뱃지 컬렉션 카드) 처리 — `MeCommand` 가 `deferReply` 앞에서 위임한다.
 * profile 경로(viewOption·me-ment 쿼터)와 라우트가 분리돼 있어 프로필 API 를 호출하지 않는다.
 */

const BADGES_ATTACHMENT_NAME = 'badges.png';
const AVATAR_SIZE = 128;

interface HandleBadgesViewParams {
  interaction: ChatInputCommandInteraction;
  apiClient: BotApiClientService;
  i18n: BotI18nService;
  locale: string;
  logger: Logger;
}

/** 성공 응답을 PNG 첨부 페이로드로 변환한다. 이미지가 없으면 null. */
export function buildBadgesReply(
  result: MeBadgesBotResponse,
): { files: AttachmentBuilder[] } | null {
  if (!result.ok || !result.data) return null;
  const imageBuffer = Buffer.from(result.data.imageBase64, 'base64');
  return { files: [new AttachmentBuilder(imageBuffer, { name: BADGES_ATTACHMENT_NAME })] };
}

/**
 * `/me 보기:뱃지` 본 처리. `interaction.guildId` 는 호출부가 보장하지만 방어적으로 한 번 더 거른다.
 * 공개 defer → 성공 시 PNG 편집, 실패 시 defer 응답 삭제 + ephemeral 안내.
 */
export async function handleBadgesView(params: HandleBadgesViewParams): Promise<void> {
  const { interaction, apiClient, i18n, locale, logger } = params;
  const guildId = interaction.guildId;
  if (!guildId) return;

  await interaction.deferReply();

  try {
    // 캐시 미적재 시 member 는 API 원시 객체(displayName 없음)일 수 있어 in 가드로 좁힌다.
    const { member } = interaction;
    const displayName =
      member && 'displayName' in member ? member.displayName : interaction.user.displayName;
    const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: AVATAR_SIZE });

    const result = await apiClient.getBadgeCollectionCard({
      guildId,
      userId: interaction.user.id,
      displayName,
      avatarUrl,
      locale: parseLocale(locale),
    });

    const reply = buildBadgesReply(result);
    if (reply) {
      await interaction.editReply(reply);
      return;
    }
    await replaceWithEphemeralNotice(interaction, logger, i18n.t(locale, 'commands.meBadgesError'));
  } catch (error) {
    logger.error('Me badges error', error instanceof Error ? error.stack : String(error));
    await replaceWithEphemeralNotice(interaction, logger, i18n.t(locale, 'commands.meBadgesError'));
  }
}
