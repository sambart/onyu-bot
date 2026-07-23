import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type {
  MissionMyProgressStatus,
  MissionMyResponse,
  MocoMyCanvasResponse,
  MocoMyResponse,
  MocoRankCanvasResponse,
  MocoRankResponse,
} from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import type { APIEmbed, ButtonInteraction, Interaction } from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';

/** 뉴비 모듈 버튼 customId 접두사 */
const NEWBIE_CUSTOM_ID = {
  MISSION_REFRESH: 'newbie_mission:refresh:',
  MISSION_MY: 'newbie_mission:my:',
  MOCO_PREV: 'newbie_moco:prev:',
  MOCO_NEXT: 'newbie_moco:next:',
  MOCO_REFRESH: 'newbie_moco:refresh:',
  MOCO_MY: 'newbie_moco:my:',
} as const;

/** A4 "내 진행도" 상태 → i18n 키 매핑 — newbie-template.constants.ts DEFAULT_STATUS_MAPPING과 정합 */
const MISSION_STATUS_KEY: Record<MissionMyProgressStatus, string> = {
  IN_PROGRESS: 'newbie.missionStatusInProgress',
  COMPLETED: 'newbie.missionStatusCompleted',
  FAILED: 'newbie.missionStatusFailed',
  LEFT: 'newbie.missionStatusLeft',
};

function isMocoRankCanvasResponse(v: MocoRankResponse): v is MocoRankCanvasResponse {
  return v.mode === 'CANVAS';
}

function isMocoMyCanvasResponse(v: MocoMyResponse): v is MocoMyCanvasResponse {
  return v.mode === 'CANVAS';
}

/**
 * Discord interactionCreate 이벤트를 수신하여 뉴비 관련 버튼 인터랙션을 API로 전달한다.
 * newbie_mission: 또는 newbie_moco: 접두사를 가진 버튼만 처리한다.
 */
@Injectable()
export class BotNewbieInteractionHandler {
  private readonly logger = new Logger(BotNewbieInteractionHandler.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @On('interactionCreate')
  async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    const isMission =
      customId.startsWith(NEWBIE_CUSTOM_ID.MISSION_REFRESH) ||
      customId.startsWith(NEWBIE_CUSTOM_ID.MISSION_MY);
    const isMoco =
      customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_PREV) ||
      customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_NEXT) ||
      customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_REFRESH) ||
      customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_MY);

    if (!isMission && !isMoco) return;

    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    try {
      if (isMission) {
        await this.handleMissionButton(interaction, locale);
      } else {
        await this.handleMocoButton(interaction, locale);
      }
    } catch (error) {
      this.logger.error(
        `[BOT] Newbie interaction failed: customId=${customId}`,
        error instanceof Error ? error.stack : error,
      );

      try {
        const content = this.i18n.t(locale, 'errors.genericError');
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ ephemeral: true, content });
        } else {
          await interaction.reply({ ephemeral: true, content });
        }
      } catch (replyError) {
        this.logger.error(
          '[BOT] Failed to send error reply',
          replyError instanceof Error ? replyError.stack : replyError,
        );
      }
    }
  }

  /**
   * newbie_mission:refresh:{guildId} / newbie_mission:my:{guildId} 버튼 처리.
   */
  private async handleMissionButton(interaction: ButtonInteraction, locale: string): Promise<void> {
    const customId = interaction.customId;

    if (customId.startsWith(NEWBIE_CUSTOM_ID.MISSION_MY)) {
      await this.handleMissionMyButton(interaction, locale);
      return;
    }

    const guildId = customId.slice(NEWBIE_CUSTOM_ID.MISSION_REFRESH.length);

    if (!guildId) {
      await interaction.reply({
        ephemeral: true,
        content: this.i18n.t(locale, 'errors.invalidRequest'),
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    await this.apiClient.refreshMissionEmbed({ guildId });
    await interaction.editReply({ content: this.i18n.t(locale, 'newbie.missionRefreshed') });
  }

  /**
   * A4: newbie_mission:my:{guildId} 버튼 처리. 본인의 미션 진행도를 ephemeral로 조회한다.
   */
  private async handleMissionMyButton(
    interaction: ButtonInteraction,
    locale: string,
  ): Promise<void> {
    const guildId = interaction.customId.slice(NEWBIE_CUSTOM_ID.MISSION_MY.length);

    if (!guildId) {
      await interaction.reply({
        ephemeral: true,
        content: this.i18n.t(locale, 'errors.invalidRequest'),
      });
      return;
    }

    const memberId = interaction.user.id;
    await interaction.deferReply({ ephemeral: true });
    const response = await this.apiClient.getMyMissionData(guildId, memberId);
    await interaction.editReply({ content: this.formatMyMissionContent(response, locale) });
  }

  /**
   * A4 "내 진행도" ephemeral 응답 텍스트 구성.
   * missionUseMicTime 반영 플레이타임 라벨은 API가 계산한 초 값을 그대로 표기한다(봇은 형식 변환만).
   */
  private formatMyMissionContent(response: MissionMyResponse, locale: string): string {
    if (!response.hasMission) {
      return this.i18n.t(locale, 'newbie.missionNone');
    }

    const { data } = response;
    const statusLabel = this.i18n.t(locale, MISSION_STATUS_KEY[data.status] ?? data.status);
    const playtime = this.formatSecToHourMin(data.playtimeSec, locale);
    const targetPlaytime = this.formatSecToHourMin(data.targetPlaytimeSec, locale);
    const targetPlayCountText =
      data.targetPlayCount === null
        ? this.i18n.t(locale, 'newbie.missionTargetNone')
        : this.i18n.t(locale, 'newbie.missionTargetCount', { count: data.targetPlayCount });

    const lines = [
      this.i18n.t(locale, 'newbie.missionMyTitle'),
      this.i18n.t(locale, 'newbie.missionMyStatus', { status: statusLabel }),
      this.i18n.t(locale, 'newbie.missionMyPlaytime', { playtime, target: targetPlaytime }),
      this.i18n.t(locale, 'newbie.missionMyPlayCount', {
        count: data.playCount,
        target: targetPlayCountText,
      }),
      this.i18n.t(locale, 'newbie.missionMyDeadline', {
        endDate: data.endDate,
        daysLeft: data.daysLeft,
      }),
    ];

    return lines.join('\n');
  }

  private formatSecToHourMin(totalSec: number, locale: string): string {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    if (m === 0) return this.i18n.t(locale, 'newbie.durationHour', { h });
    return this.i18n.t(locale, 'newbie.durationHourMin', { h, m });
  }

  /**
   * newbie_moco 버튼 처리 (prev/next/refresh/my).
   * API에서 랭킹 데이터를 받아 인터랙션을 업데이트한다.
   */
  private async handleMocoButton(interaction: ButtonInteraction, locale: string): Promise<void> {
    const customId = interaction.customId;

    if (customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_REFRESH)) {
      // newbie_moco:refresh:{guildId}
      const guildId = customId.slice(NEWBIE_CUSTOM_ID.MOCO_REFRESH.length);
      await interaction.deferUpdate();
      const response = await this.apiClient.getMocoRankData(guildId, 1);
      await this.applyMocoRankResponse(interaction, response);
      return;
    }

    if (customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_PREV)) {
      // newbie_moco:prev:{guildId}:{currentPage}
      const rest = customId.slice(NEWBIE_CUSTOM_ID.MOCO_PREV.length);
      const lastColon = rest.lastIndexOf(':');
      const guildId = rest.slice(0, lastColon);
      const currentPage = parseInt(rest.slice(lastColon + 1), 10);
      await interaction.deferUpdate();
      const response = await this.apiClient.getMocoRankData(guildId, currentPage - 1);
      await this.applyMocoRankResponse(interaction, response);
      return;
    }

    if (customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_NEXT)) {
      // newbie_moco:next:{guildId}:{currentPage}
      const rest = customId.slice(NEWBIE_CUSTOM_ID.MOCO_NEXT.length);
      const lastColon = rest.lastIndexOf(':');
      const guildId = rest.slice(0, lastColon);
      const currentPage = parseInt(rest.slice(lastColon + 1), 10);
      await interaction.deferUpdate();
      const response = await this.apiClient.getMocoRankData(guildId, currentPage + 1);
      await this.applyMocoRankResponse(interaction, response);
      return;
    }

    if (customId.startsWith(NEWBIE_CUSTOM_ID.MOCO_MY)) {
      // newbie_moco:my:{guildId}
      const guildId = customId.slice(NEWBIE_CUSTOM_ID.MOCO_MY.length);
      const userId = interaction.user.id;
      await interaction.deferReply({ ephemeral: true });
      const response = await this.apiClient.getMyHuntingData(guildId, userId);

      if (isMocoMyCanvasResponse(response)) {
        const buffer = Buffer.from(response.imageBase64, 'base64');
        await interaction.editReply({
          files: [{ attachment: buffer, name: 'moco-detail.png' }],
        });
      } else {
        const content =
          response.mode === 'EMBED'
            ? response.data
            : this.i18n.t(locale, 'newbie.mocoDataUnavailable');
        await interaction.editReply({ content });
      }
    }
  }

  /**
   * API 응답 mode에 따라 Embed 또는 Canvas 이미지로 메시지를 수정한다.
   */
  private async applyMocoRankResponse(
    interaction: ButtonInteraction,
    response: MocoRankResponse,
  ): Promise<void> {
    // API에서 toJSON()된 ActionRow 직렬화 결과를 edit()에 직접 전달한다.
    // discord.js 타입과 raw API 객체 간 타입 불일치를 unknown 경유로 우회한다.
    if (isMocoRankCanvasResponse(response)) {
      const buffer = Buffer.from(response.imageBase64, 'base64');
      await interaction.message.edit({
        content: '',
        embeds: [],
        files: [{ attachment: buffer, name: 'moco-rank.png' }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        components: response.components as any,
      });
    } else {
      await interaction.message.edit({
        embeds: response.embeds as APIEmbed[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        components: response.components as any,
      });
    }
  }
}
