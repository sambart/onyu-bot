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

/** 뉴비 모듈 버튼 customId 접두사 */
const NEWBIE_CUSTOM_ID = {
  MISSION_REFRESH: 'newbie_mission:refresh:',
  MISSION_MY: 'newbie_mission:my:',
  MOCO_PREV: 'newbie_moco:prev:',
  MOCO_NEXT: 'newbie_moco:next:',
  MOCO_REFRESH: 'newbie_moco:refresh:',
  MOCO_MY: 'newbie_moco:my:',
} as const;

/** A4 "내 진행도" 상태 라벨(하드코딩 한국어) — newbie-template.constants.ts DEFAULT_STATUS_MAPPING과 정합 */
const MISSION_STATUS_LABEL: Record<MissionMyProgressStatus, string> = {
  IN_PROGRESS: '진행중',
  COMPLETED: '완료',
  FAILED: '실패',
  LEFT: '퇴장',
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

  constructor(private readonly apiClient: BotApiClientService) {}

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

    try {
      if (isMission) {
        await this.handleMissionButton(interaction);
      } else {
        await this.handleMocoButton(interaction);
      }
    } catch (error) {
      this.logger.error(
        `[BOT] Newbie interaction failed: customId=${customId}`,
        error instanceof Error ? error.stack : error,
      );

      try {
        const content = '오류가 발생했습니다. 잠시 후 다시 시도하세요.';
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
  private async handleMissionButton(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;

    if (customId.startsWith(NEWBIE_CUSTOM_ID.MISSION_MY)) {
      await this.handleMissionMyButton(interaction);
      return;
    }

    const guildId = customId.slice(NEWBIE_CUSTOM_ID.MISSION_REFRESH.length);

    if (!guildId) {
      await interaction.reply({ ephemeral: true, content: '잘못된 요청입니다.' });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    await this.apiClient.refreshMissionEmbed({ guildId });
    await interaction.editReply({ content: '미션 현황이 갱신되었습니다.' });
  }

  /**
   * A4: newbie_mission:my:{guildId} 버튼 처리. 본인의 미션 진행도를 ephemeral로 조회한다.
   */
  private async handleMissionMyButton(interaction: ButtonInteraction): Promise<void> {
    const guildId = interaction.customId.slice(NEWBIE_CUSTOM_ID.MISSION_MY.length);

    if (!guildId) {
      await interaction.reply({ ephemeral: true, content: '잘못된 요청입니다.' });
      return;
    }

    const memberId = interaction.user.id;
    await interaction.deferReply({ ephemeral: true });
    const response = await this.apiClient.getMyMissionData(guildId, memberId);
    await interaction.editReply({ content: this.formatMyMissionContent(response) });
  }

  /**
   * A4 "내 진행도" ephemeral 응답 텍스트 구성 (하드코딩 한국어).
   * missionUseMicTime 반영 플레이타임 라벨은 API가 계산한 초 값을 그대로 표기한다(봇은 형식 변환만).
   */
  private formatMyMissionContent(response: MissionMyResponse): string {
    if (!response.hasMission) {
      return '진행 중인 미션이 없습니다.';
    }

    const { data } = response;
    const statusLabel = MISSION_STATUS_LABEL[data.status] ?? data.status;
    const playtime = this.formatSecToHourMin(data.playtimeSec);
    const targetPlaytime = this.formatSecToHourMin(data.targetPlaytimeSec);
    const targetPlayCountText =
      data.targetPlayCount === null ? '설정 없음' : `${data.targetPlayCount}회`;

    const lines = [
      `🧑‍🌾 **내 미션 진행도**`,
      `상태: ${statusLabel}`,
      `누적 플레이타임: ${playtime} / 목표 ${targetPlaytime}`,
      `플레이 횟수: ${data.playCount}회 / 목표 ${targetPlayCountText}`,
      `마감일: ${data.endDate} (D-${data.daysLeft})`,
    ];

    return lines.join('\n');
  }

  private formatSecToHourMin(totalSec: number): string {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    if (m === 0) return `${h}시간`;
    return `${h}시간 ${m}분`;
  }

  /**
   * newbie_moco 버튼 처리 (prev/next/refresh/my).
   * API에서 랭킹 데이터를 받아 인터랙션을 업데이트한다.
   */
  private async handleMocoButton(interaction: ButtonInteraction): Promise<void> {
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
        const content = response.mode === 'EMBED' ? response.data : '데이터를 불러올 수 없습니다.';
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
