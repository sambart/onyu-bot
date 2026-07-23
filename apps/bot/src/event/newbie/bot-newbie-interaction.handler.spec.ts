/**
 * BotNewbieInteractionHandler 단위 테스트 — MISSION_MY(newbie_mission:my:{guildId}) 버튼 흐름 중심.
 * A4 "내 진행도" 셀프 조회(F-NEWBIE-002/UF-NEWBIE-008)의 봇 인터랙션 처리를 검증한다.
 */
import type { BotApiClientService, MissionMyResponse } from '@onyu/bot-api-client';
import type { ButtonInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { BotNewbieInteractionHandler } from './bot-newbie-interaction.handler';

function makeButtonInteraction(overrides: Record<string, unknown> = {}): ButtonInteraction {
  return {
    isButton: () => true,
    customId: 'newbie_mission:my:guild-1',
    user: { id: 'user-1' },
    guildId: 'guild-1',
    locale: 'ko',
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    replied: false,
    deferred: false,
    ...overrides,
  } as unknown as ButtonInteraction;
}

describe('BotNewbieInteractionHandler', () => {
  let handler: BotNewbieInteractionHandler;
  let apiClient: {
    refreshMissionEmbed: Mock;
    getMyMissionData: Mock;
    getMocoRankData: Mock;
    getMyHuntingData: Mock;
  };

  beforeEach(() => {
    apiClient = {
      refreshMissionEmbed: vi.fn().mockResolvedValue(undefined),
      getMyMissionData: vi.fn(),
      getMocoRankData: vi.fn(),
      getMyHuntingData: vi.fn(),
    };

    const i18n = new BotI18nService();
    i18n.onModuleInit();
    handler = new BotNewbieInteractionHandler(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService(),
    );
  });

  // ──────────────────────────────────────────────────────
  // MISSION_MY 버튼 — ephemeral 응답, 참여/미참여 분기
  // ──────────────────────────────────────────────────────
  describe('newbie_mission:my 버튼 (MISSION_MY)', () => {
    it('버튼 클릭 시 deferReply({ephemeral: true})를 먼저 호출한다', async () => {
      const interaction = makeButtonInteraction();
      apiClient.getMyMissionData.mockResolvedValue({ ok: true, hasMission: false });

      await handler.handle(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });

    it('apiClient.getMyMissionData를 guildId, 클릭한 사용자 id로 호출한다', async () => {
      const interaction = makeButtonInteraction({
        customId: 'newbie_mission:my:guild-42',
        user: { id: 'user-99' },
      });
      apiClient.getMyMissionData.mockResolvedValue({ ok: true, hasMission: false });

      await handler.handle(interaction);

      expect(apiClient.getMyMissionData).toHaveBeenCalledWith('guild-42', 'user-99');
    });

    it('미참여(hasMission: false)이면 "진행 중인 미션이 없습니다." 메시지로 editReply한다', async () => {
      const interaction = makeButtonInteraction();
      const response: MissionMyResponse = { ok: true, hasMission: false };
      apiClient.getMyMissionData.mockResolvedValue(response);

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '진행 중인 미션이 없습니다.',
      });
    });

    it('참여(hasMission: true)이면 상태/플레이타임/횟수/마감일이 포함된 텍스트로 editReply한다', async () => {
      const interaction = makeButtonInteraction();
      const response: MissionMyResponse = {
        ok: true,
        hasMission: true,
        data: {
          status: 'IN_PROGRESS',
          playtimeSec: 3600,
          playCount: 2,
          targetPlaytimeSec: 10800,
          targetPlayCount: 5,
          endDate: '2026-03-08',
          daysLeft: 3,
        },
      };
      apiClient.getMyMissionData.mockResolvedValue(response);

      await handler.handle(interaction);

      const editReplyArg = (interaction.editReply as Mock).mock.calls[0][0] as { content: string };
      expect(editReplyArg.content).toContain('진행중');
      expect(editReplyArg.content).toContain('1시간');
      expect(editReplyArg.content).toContain('2회');
      expect(editReplyArg.content).toContain('5회');
      expect(editReplyArg.content).toContain('2026-03-08');
      expect(editReplyArg.content).toContain('D-3');
    });

    it('targetPlayCount가 null이면 "설정 없음"으로 표기한다', async () => {
      const interaction = makeButtonInteraction();
      const response: MissionMyResponse = {
        ok: true,
        hasMission: true,
        data: {
          status: 'IN_PROGRESS',
          playtimeSec: 0,
          playCount: 0,
          targetPlaytimeSec: 10800,
          targetPlayCount: null,
          endDate: '2026-03-08',
          daysLeft: 3,
        },
      };
      apiClient.getMyMissionData.mockResolvedValue(response);

      await handler.handle(interaction);

      const editReplyArg = (interaction.editReply as Mock).mock.calls[0][0] as { content: string };
      expect(editReplyArg.content).toContain('설정 없음');
    });

    it('guildId가 비어있으면(잘못된 customId) deferReply 없이 잘못된 요청 메시지를 reply한다', async () => {
      const interaction = makeButtonInteraction({ customId: 'newbie_mission:my:' });

      await handler.handle(interaction);

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith({
        ephemeral: true,
        content: '잘못된 요청입니다.',
      });
      expect(apiClient.getMyMissionData).not.toHaveBeenCalled();
    });

    it('getMyMissionData가 실패하면 ephemeral 오류 메시지로 followUp한다(deferred 이후)', async () => {
      const interaction = makeButtonInteraction({ deferred: true });
      apiClient.getMyMissionData.mockRejectedValue(new Error('API 500'));

      await handler.handle(interaction);

      expect(interaction.followUp).toHaveBeenCalledWith({
        ephemeral: true,
        content: '오류가 발생했습니다. 잠시 후 다시 시도하세요.',
      });
    });

    it('버튼이 아닌 인터랙션은 무시한다(isButton()=false)', async () => {
      const interaction = { isButton: () => false } as unknown as ButtonInteraction;

      await handler.handle(interaction);

      expect(apiClient.getMyMissionData).not.toHaveBeenCalled();
    });

    it('newbie_mission 접두사가 아닌 customId는 무시한다', async () => {
      const interaction = makeButtonInteraction({ customId: 'other_feature:button:1' });

      await handler.handle(interaction);

      expect(apiClient.getMyMissionData).not.toHaveBeenCalled();
      expect(interaction.deferReply).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // newbie_mission:refresh 버튼과의 분기 회귀 방지 (MISSION_MY 도입으로 라우팅 확장됨)
  // ──────────────────────────────────────────────────────
  describe('newbie_mission:refresh 버튼과의 분기', () => {
    it('refresh 버튼은 여전히 refreshMissionEmbed를 호출하고 getMyMissionData는 호출하지 않는다', async () => {
      const interaction = makeButtonInteraction({ customId: 'newbie_mission:refresh:guild-1' });

      await handler.handle(interaction);

      expect(apiClient.refreshMissionEmbed).toHaveBeenCalledWith({ guildId: 'guild-1' });
      expect(apiClient.getMyMissionData).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // en 로케일 동작 — 이번 i18n 이관의 핵심 목적(비한국어 클라이언트 영어 응답) 검증
  // ──────────────────────────────────────────────────────
  describe('locale — en-US', () => {
    it('미참여(hasMission: false)이면 영어 메시지로 editReply한다', async () => {
      const interaction = makeButtonInteraction({ locale: 'en-US' });
      const response: MissionMyResponse = { ok: true, hasMission: false };
      apiClient.getMyMissionData.mockResolvedValue(response);

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'You have no mission in progress.',
      });
    });

    it('참여(hasMission: true)이면 상태/플레이타임/횟수/마감일이 영어로 포함된 텍스트로 editReply한다', async () => {
      const interaction = makeButtonInteraction({ locale: 'en-US' });
      const response: MissionMyResponse = {
        ok: true,
        hasMission: true,
        data: {
          status: 'IN_PROGRESS',
          playtimeSec: 3600,
          playCount: 2,
          targetPlaytimeSec: 10800,
          targetPlayCount: 5,
          endDate: '2026-03-08',
          daysLeft: 3,
        },
      };
      apiClient.getMyMissionData.mockResolvedValue(response);

      await handler.handle(interaction);

      const editReplyArg = (interaction.editReply as Mock).mock.calls[0][0] as { content: string };
      expect(editReplyArg.content).toContain('In progress');
      expect(editReplyArg.content).toContain('1h');
      expect(editReplyArg.content).toContain('Play count: 2');
      expect(editReplyArg.content).toContain('goal 5');
      expect(editReplyArg.content).toContain('2026-03-08');
      expect(editReplyArg.content).toContain('D-3');
      // ko 문자열이 잔존하지 않아야 한다 — 혼재 회귀 방지
      expect(editReplyArg.content).not.toContain('진행중');
    });

    it('targetPlayCount가 null이면 "Not set"으로 표기한다', async () => {
      const interaction = makeButtonInteraction({ locale: 'en-US' });
      const response: MissionMyResponse = {
        ok: true,
        hasMission: true,
        data: {
          status: 'IN_PROGRESS',
          playtimeSec: 0,
          playCount: 0,
          targetPlaytimeSec: 10800,
          targetPlayCount: null,
          endDate: '2026-03-08',
          daysLeft: 3,
        },
      };
      apiClient.getMyMissionData.mockResolvedValue(response);

      await handler.handle(interaction);

      const editReplyArg = (interaction.editReply as Mock).mock.calls[0][0] as { content: string };
      expect(editReplyArg.content).toContain('Not set');
    });

    it('guildId가 비어있으면(잘못된 customId) 영어 잘못된 요청 메시지를 reply한다', async () => {
      const interaction = makeButtonInteraction({
        customId: 'newbie_mission:my:',
        locale: 'en-US',
      });

      await handler.handle(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        ephemeral: true,
        content: 'Invalid request.',
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // 로케일 폴백 — 미지원 로케일(ja) → en
  // ──────────────────────────────────────────────────────
  describe('locale — 미지원 로케일(ja) 폴백', () => {
    it('ja 로케일이면 en으로 폴백하여 영어 메시지를 반환한다', async () => {
      const interaction = makeButtonInteraction({ locale: 'ja' });
      const response: MissionMyResponse = { ok: true, hasMission: false };
      apiClient.getMyMissionData.mockResolvedValue(response);

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'You have no mission in progress.',
      });
    });
  });
});
