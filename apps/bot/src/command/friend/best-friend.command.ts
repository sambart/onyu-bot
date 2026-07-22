import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { BestFriendCardResponse } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  GuildMember,
} from 'discord.js';

// 집계 기간 (일) — 30일 고정.
// getMyBestFriends period 파라미터가 7 | 30 | 90 리터럴 유니온이므로 as const 필수
const PERIOD = 30 as const;
// TOP N — 5명 고정
const LIMIT = 5;
// 대시보드 기본 URL (WEB_URL 미설정 시 prod 도메인)
const DEFAULT_WEB_URL = 'https://onyu.dev';

@Command({
  name: 'best-friend',
  nameLocalizations: { ko: '친한친구' },
  description: 'Show my best friend TOP card',
  descriptionLocalizations: { ko: '내 베스트 프렌드 TOP을 카드로 보여줍니다' },
})
@Injectable()
export class BestFriendCommand {
  private readonly logger = new Logger(BestFriendCommand.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @Handler()
  async onBestFriend(@InteractionEvent() interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({ content: '서버에서만 사용 가능한 명령어입니다.', ephemeral: true });
      return;
    }

    // 공개 응답 고정 (ephemeral 없음)
    await interaction.deferReply();

    try {
      // GuildMember 캐스팅 — discord-nestjs CommandInteraction.member는 APIInteractionGuildMember | GuildMember 유니온
      const displayName =
        (interaction.member as GuildMember)?.displayName ?? interaction.user.displayName;
      const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });

      const result = await this.apiClient.getMyBestFriends(
        interaction.guildId,
        interaction.user.id,
        displayName,
        avatarUrl,
        PERIOD,
        LIMIT,
      );

      const linkButtonRow = this.buildLinkButtonRow(interaction.guildId);

      // errorCode 우선 처리 — PRIVATE, NO_DATA 등
      if (result.errorCode) {
        const message = this.resolveErrorMessage(result.errorCode, result.days);
        await interaction.editReply({ content: message, components: [linkButtonRow] });
        return;
      }

      if (!result.data) {
        await interaction.editReply({
          content: `최근 ${result.days}일간 함께한 친구 기록이 없어요. 음성방에 들어가 친구를 만들어보세요!`,
          components: [linkButtonRow],
        });
        return;
      }

      await this.renderCard(interaction, result, linkButtonRow);
    } catch (error) {
      this.logger.error(
        'BestFriend command error',
        error instanceof Error ? error.stack : String(error),
      );
      await interaction.editReply({ content: '베스트 프렌드 조회 중 오류가 발생했습니다.' });
    }
  }

  /** errorCode를 사용자 친화적 메시지로 변환한다. */
  private resolveErrorMessage(errorCode: string, days: number): string {
    if (errorCode === 'PRIVATE') {
      return '비공개 설정된 사용자가 포함되어 있습니다.';
    }
    if (errorCode === 'NO_DATA') {
      return `최근 ${days}일간 함께한 친구 기록이 없어요. 음성방에 들어가 친구를 만들어보세요!`;
    }
    // 예상치 못한 errorCode — 안내 메시지 fallback
    return '베스트 프렌드 조회 중 알 수 없는 오류가 발생했습니다.';
  }

  private buildLinkButtonRow(guildId: string): ActionRowBuilder<ButtonBuilder> {
    // WEB_URL은 런타임에 읽는다 — 모듈 import 시점에 평가하면 ConfigModule의 .env 로드 전이라 fallback이 굳을 수 있다
    const webUrl = process.env['WEB_URL'] ?? DEFAULT_WEB_URL;
    const button = new ButtonBuilder()
      .setLabel('대시보드에서 그래프 보기')
      .setStyle(ButtonStyle.Link)
      .setURL(`${webUrl}/dashboard/guild/${guildId}/co-presence`);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  }

  private async renderCard(
    interaction: ChatInputCommandInteraction,
    result: BestFriendCardResponse,
    linkButtonRow: ActionRowBuilder<ButtonBuilder>,
  ): Promise<void> {
    if (!result.data) {
      return;
    }
    const imageBuffer = Buffer.from(result.data.imageBase64, 'base64');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'best-friends.png' });

    await interaction.editReply({
      files: [attachment],
      components: [linkButtonRow],
    });
  }
}
