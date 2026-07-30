/**
 * BotMeInteractionHandler 단위 테스트 — `/미` 카드 버튼([💬 활동 상세]/[🏆 서버 리더보드])
 * interactionCreate 이벤트 처리를 검증한다(F-VOICE-064/065, UF-VOICE-CMD-003).
 * `bot-newbie-interaction.handler.spec.ts` 패턴(BotI18nService 실 로드 + 목 ButtonInteraction) 준용.
 */
import type { BotApiClientService, MeActivityDetailResponse } from '@onyu/bot-api-client';
import type { LevelLeaderboardResponse } from '@onyu/shared';
import type { ButtonInteraction, EmbedBuilder, Interaction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { BotMeInteractionHandler } from './bot-me-interaction.handler';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';

function makeButtonInteraction(overrides: Record<string, unknown> = {}): ButtonInteraction {
  return {
    isButton: () => true,
    customId: 'me:activity_detail',
    user: { id: USER_ID },
    guildId: GUILD_ID,
    locale: 'ko',
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    isRepliable: () => true,
    replied: false,
    deferred: false,
    ...overrides,
  } as unknown as ButtonInteraction;
}

function activityDetailResponse(
  data: Partial<MeActivityDetailResponse['data']> = {},
): MeActivityDetailResponse {
  return {
    ok: true,
    days: 15,
    data: {
      voice: { totalSec: 5400, rank: 3, totalUsers: 42, upPercent: 8 },
      message: { totalCount: 214, rank: 5, totalUsers: 38, upPercent: 14 },
      ...data,
    },
  };
}

function leaderboardResponse(
  overrides: Partial<LevelLeaderboardResponse> = {},
): LevelLeaderboardResponse {
  return {
    total: 2,
    page: 1,
    limit: 10,
    users: [
      { rank: 1, userId: 'user-1', nickName: 'Alice', avatarUrl: null, level: 5, xp: 500 },
      { rank: 2, userId: 'user-2', nickName: 'Bob', avatarUrl: null, level: 4, xp: 300 },
    ],
    ...overrides,
  };
}

/** editReply에 전달된 embed 인자를 순수 JSON으로 변환한다. */
function embedJson(interaction: ButtonInteraction): Record<string, unknown> {
  const arg = (interaction.editReply as Mock).mock.calls[0][0] as { embeds: EmbedBuilder[] };
  return arg.embeds[0].toJSON() as unknown as Record<string, unknown>;
}

describe('BotMeInteractionHandler', () => {
  let handler: BotMeInteractionHandler;
  let apiClient: {
    getMeActivityDetail: Mock;
    getGuildLevelLeaderboard: Mock;
  };

  beforeEach(() => {
    apiClient = {
      getMeActivityDetail: vi.fn(),
      getGuildLevelLeaderboard: vi.fn(),
    };

    const i18n = new BotI18nService();
    i18n.onModuleInit();
    handler = new BotMeInteractionHandler(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService(),
    );
  });

  describe('공통 필터링', () => {
    it('버튼이 아닌 인터랙션은 무시한다(isButton()=false)', async () => {
      const interaction = { isButton: () => false } as unknown as Interaction;

      await handler.handle(interaction);

      expect(apiClient.getMeActivityDetail).not.toHaveBeenCalled();
    });

    it('me: 접두사가 아닌 customId는 무시한다', async () => {
      const interaction = makeButtonInteraction({ customId: 'other_feature:button:1' });

      await handler.handle(interaction);

      expect(apiClient.getMeActivityDetail).not.toHaveBeenCalled();
      expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    it('DM(guildId 없음)이면 무시한다(UF-VOICE-CMD-003, API 호출 없음)', async () => {
      const interaction = makeButtonInteraction({ guildId: null });

      await handler.handle(interaction);

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(apiClient.getMeActivityDetail).not.toHaveBeenCalled();
    });
  });

  describe('me:activity_detail 버튼 (F-VOICE-064)', () => {
    it('deferReply({ephemeral:true})를 먼저 호출한다', async () => {
      const interaction = makeButtonInteraction();
      apiClient.getMeActivityDetail.mockResolvedValue(activityDetailResponse());

      await handler.handle(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });

    it('apiClient.getMeActivityDetail을 guildId, 클릭자 본인 id로 호출한다(카드 소유자 아님)', async () => {
      const interaction = makeButtonInteraction({
        guildId: 'guild-9',
        user: { id: 'clicker-1' },
      });
      apiClient.getMeActivityDetail.mockResolvedValue(activityDetailResponse());

      await handler.handle(interaction);

      expect(apiClient.getMeActivityDetail).toHaveBeenCalledWith('guild-9', 'clicker-1');
    });

    it('음성/메시지 정상 데이터를 필드 2개 + footer가 있는 embed로 editReply한다', async () => {
      const interaction = makeButtonInteraction();
      apiClient.getMeActivityDetail.mockResolvedValue(activityDetailResponse());

      await handler.handle(interaction);

      const json = embedJson(interaction);
      const fields = json.fields as Array<{ name: string; value: string }>;

      expect(fields).toHaveLength(2);
      expect(fields[0].name).toBe('🎙️ 음성 활동');
      expect(fields[0].value).toBe('1시간 30분\n서버 내 3위 / 42명 (상위 8%)');
      expect(fields[1].name).toBe('💬 메시지 활동');
      expect(fields[1].value).toBe('214\n서버 내 5위 / 38명 (상위 14%)');
      expect((json.footer as { text: string }).text).toBe(
        '레벨 순위는 /미 카드 참고 · 웹 대시보드는 최근 30일 기준',
      );
    });

    it('voice가 null(활동 없음)이면 "활동 기록이 없습니다." 문구를 표시한다', async () => {
      const interaction = makeButtonInteraction();
      apiClient.getMeActivityDetail.mockResolvedValue(activityDetailResponse({ voice: null }));

      await handler.handle(interaction);

      const json = embedJson(interaction);
      const fields = json.fields as Array<{ name: string; value: string }>;
      expect(fields[0].value).toBe('활동 기록이 없습니다.');
    });

    it('voice가 {error:true}(조회 실패)이면 "조회 중 오류가 발생했습니다." 문구를 표시한다', async () => {
      const interaction = makeButtonInteraction();
      apiClient.getMeActivityDetail.mockResolvedValue(
        activityDetailResponse({ voice: { error: true } }),
      );

      await handler.handle(interaction);

      const json = embedJson(interaction);
      const fields = json.fields as Array<{ name: string; value: string }>;
      expect(fields[0].value).toBe('조회 중 오류가 발생했습니다.');
    });

    it('message가 null이어도 voice 필드는 독립적으로 정상 표시된다(부분 실패 격리)', async () => {
      const interaction = makeButtonInteraction();
      apiClient.getMeActivityDetail.mockResolvedValue(activityDetailResponse({ message: null }));

      await handler.handle(interaction);

      const json = embedJson(interaction);
      const fields = json.fields as Array<{ name: string; value: string }>;
      expect(fields[0].value).toBe('1시간 30분\n서버 내 3위 / 42명 (상위 8%)');
      expect(fields[1].value).toBe('활동 기록이 없습니다.');
    });

    it('en 로케일이면 영어 라벨/문구로 응답한다', async () => {
      const interaction = makeButtonInteraction({ locale: 'en-US' });
      apiClient.getMeActivityDetail.mockResolvedValue(activityDetailResponse({ voice: null }));

      await handler.handle(interaction);

      const json = embedJson(interaction);
      const fields = json.fields as Array<{ name: string; value: string }>;
      expect(fields[0].name).toBe('🎙️ Voice Activity');
      expect(fields[0].value).toBe('No activity recorded.');
    });
  });

  describe('me:leaderboard 버튼 (F-VOICE-065)', () => {
    it('deferReply({ephemeral:true})를 먼저 호출한다', async () => {
      const interaction = makeButtonInteraction({ customId: 'me:leaderboard' });
      apiClient.getGuildLevelLeaderboard.mockResolvedValue(leaderboardResponse());

      await handler.handle(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });

    it('apiClient.getGuildLevelLeaderboard를 guildId, limit=10으로 호출한다', async () => {
      const interaction = makeButtonInteraction({ customId: 'me:leaderboard', guildId: 'guild-9' });
      apiClient.getGuildLevelLeaderboard.mockResolvedValue(leaderboardResponse());

      await handler.handle(interaction);

      expect(apiClient.getGuildLevelLeaderboard).toHaveBeenCalledWith('guild-9', 10);
    });

    it('users가 있으면 TOP10 title + 순위 행이 담긴 description으로 embed를 editReply한다', async () => {
      const interaction = makeButtonInteraction({ customId: 'me:leaderboard' });
      apiClient.getGuildLevelLeaderboard.mockResolvedValue(leaderboardResponse());

      await handler.handle(interaction);

      const json = embedJson(interaction);
      expect(json.title).toBe('🏆 서버 레벨 리더보드 TOP 10');
      expect(json.description).toBe('**1.** Alice — Lv.5 (500 XP)\n**2.** Bob — Lv.4 (300 XP)');
    });

    it('users가 빈 배열(레벨 비활성 길드)이면 embed 없이 비활성 안내 문구로 editReply한다', async () => {
      const interaction = makeButtonInteraction({ customId: 'me:leaderboard' });
      apiClient.getGuildLevelLeaderboard.mockResolvedValue(leaderboardResponse({ users: [] }));

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '이 서버는 레벨 시스템이 비활성화되어 있습니다.',
      });
    });
  });

  describe('API 실패 격리', () => {
    it('activity_detail 조회 자체가 실패하면 ephemeral 에러 안내로 followUp한다(deferred 이후)', async () => {
      const interaction = makeButtonInteraction({ deferred: true });
      apiClient.getMeActivityDetail.mockRejectedValue(new Error('API 500'));

      await handler.handle(interaction);

      expect(interaction.followUp).toHaveBeenCalledWith({
        ephemeral: true,
        content: '조회 중 오류가 발생했습니다.',
      });
    });

    it('leaderboard 조회 자체가 실패하면 ephemeral 에러 안내로 followUp한다(deferred 이후)', async () => {
      const interaction = makeButtonInteraction({ customId: 'me:leaderboard', deferred: true });
      apiClient.getGuildLevelLeaderboard.mockRejectedValue(new Error('API 500'));

      await handler.handle(interaction);

      expect(interaction.followUp).toHaveBeenCalledWith({
        ephemeral: true,
        content: '조회 중 오류가 발생했습니다.',
      });
    });
  });
});
