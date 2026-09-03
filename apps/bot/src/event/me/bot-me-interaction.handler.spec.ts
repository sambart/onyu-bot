/**
 * BotMeInteractionHandler 단위 테스트 — `/미` 카드 버튼([💬 활동 상세]/[🏆 서버 리더보드])
 * interactionCreate 이벤트 처리를 검증한다(F-VOICE-064/065, UF-VOICE-CMD-003).
 * `bot-newbie-interaction.handler.spec.ts` 패턴(BotI18nService 실 로드 + 목 ButtonInteraction) 준용.
 */
import type {
  BotApiClientService,
  LevelLeaderboardCardResponse,
  MeActivityDetailResponse,
} from '@onyu/bot-api-client';
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
      voice: {
        totalSec: 5400,
        rank: 3,
        totalUsers: 42,
        upPercent: 8,
        channels: [],
        activeDays: 5,
        avgDailySec: 1080,
        micUsageRate: 40,
      },
      message: {
        totalCount: 214,
        rank: 5,
        totalUsers: 38,
        upPercent: 14,
        channels: [],
      },
      ...data,
    },
  };
}

function leaderboardCardResponse(
  overrides: Partial<LevelLeaderboardCardResponse> = {},
): LevelLeaderboardCardResponse {
  return {
    ok: true,
    data: { imageBase64: Buffer.from('leaderboard-png').toString('base64') },
    isEnabled: true,
    page: 1,
    totalPages: 3,
    total: 25,
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
    getLevelLeaderboardCard: Mock;
  };

  beforeEach(() => {
    apiClient = {
      getMeActivityDetail: vi.fn(),
      getLevelLeaderboardCard: vi.fn(),
    };

    const i18n = new BotI18nService();
    i18n.onModuleInit();
    handler = new BotMeInteractionHandler(
      apiClient as unknown as BotApiClientService,
      i18n,
      // CM-5 — LocaleResolverService 가 BotApiClientService 를 DI 받도록 확장됨(F-GENERAL-005).
      // `{ locale: null }` 을 반환시켜 리졸버가 2순위(interaction.locale)로 폴백하게 하여
      // 기존 기대값을 그대로 유지한다.
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
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

    it('음성/메시지 정상 데이터를 필드 2개 + footer가 있는 embed로 editReply한다(R7 — 음성 통계 줄 추가, 채널 TOP3는 빈 배열이라 미표시)', async () => {
      const interaction = makeButtonInteraction();
      apiClient.getMeActivityDetail.mockResolvedValue(activityDetailResponse());

      await handler.handle(interaction);

      const json = embedJson(interaction);
      const fields = json.fields as Array<{ name: string; value: string }>;

      expect(fields).toHaveLength(2);
      expect(fields[0].name).toBe('🎙️ 음성 활동');
      expect(fields[0].value).toBe(
        '1시간 30분\n서버 내 3위 / 42명 (상위 8%)\n📅 활동 5일 · 일평균 18분 · 🎤 마이크 40%',
      );
      expect(fields[1].name).toBe('💬 메시지 활동');
      expect(fields[1].value).toBe('214\n서버 내 5위 / 38명 (상위 14%)');
      expect((json.footer as { text: string }).text).toBe(
        '레벨 순위는 /미 카드 참고 · 웹 대시보드는 최근 30일 기준',
      );
    });

    // ──────────────────────────────────────────────────────
    // 채널 TOP3(F-VOICE-064 R7)
    // ──────────────────────────────────────────────────────
    it('음성 채널 TOP3가 있으면 라벨 줄 + 행 3개가 음성 필드 value에 포함된다', async () => {
      const interaction = makeButtonInteraction();
      apiClient.getMeActivityDetail.mockResolvedValue(
        activityDetailResponse({
          voice: {
            totalSec: 5400,
            rank: 3,
            totalUsers: 42,
            upPercent: 8,
            channels: [
              { channelName: '일반', durationSec: 3600 },
              { channelName: '게임', durationSec: 1200 },
              { channelName: '음악', durationSec: 600 },
            ],
            activeDays: 5,
            avgDailySec: 1080,
            micUsageRate: 40,
          },
        }),
      );

      await handler.handle(interaction);

      const json = embedJson(interaction);
      const fields = json.fields as Array<{ name: string; value: string }>;

      expect(fields[0].value).toBe(
        [
          '1시간 30분',
          '서버 내 3위 / 42명 (상위 8%)',
          '📊 채널 TOP3',
          '1. 일반 — 1시간 0분',
          '2. 게임 — 20분',
          '3. 음악 — 10분',
          '📅 활동 5일 · 일평균 18분 · 🎤 마이크 40%',
        ].join('\n'),
      );
    });

    it('메시지 채널 TOP3가 있으면 라벨 줄 + 행이 메시지 필드 value에 포함된다', async () => {
      const interaction = makeButtonInteraction();
      apiClient.getMeActivityDetail.mockResolvedValue(
        activityDetailResponse({
          message: {
            totalCount: 214,
            rank: 5,
            totalUsers: 38,
            upPercent: 14,
            channels: [
              { channelName: '잡담', messageCount: 100 },
              { channelName: '공지', messageCount: 50 },
            ],
          },
        }),
      );

      await handler.handle(interaction);

      const json = embedJson(interaction);
      const fields = json.fields as Array<{ name: string; value: string }>;

      expect(fields[1].value).toBe(
        [
          '214',
          '서버 내 5위 / 38명 (상위 14%)',
          '📊 채널 TOP2',
          '1. 잡담 — 100',
          '2. 공지 — 50',
        ].join('\n'),
      );
    });

    it('메시지 채널이 빈 배열이면(부가 조회 실패/채널 없음) 채널 라벨 줄도 표시되지 않고 값+순위 2줄만 남는다', async () => {
      const interaction = makeButtonInteraction();
      apiClient.getMeActivityDetail.mockResolvedValue(activityDetailResponse());

      await handler.handle(interaction);

      const json = embedJson(interaction);
      const fields = json.fields as Array<{ name: string; value: string }>;

      expect(fields[1].value).toBe('214\n서버 내 5위 / 38명 (상위 14%)');
      expect(fields[1].value.split('\n')).toHaveLength(2);
    });

    it('채널명이 Discord 상한(100자) 극단 입력이어도 필드 value가 embed 1024자 상한을 넘지 않는다(T-F7)', async () => {
      const interaction = makeButtonInteraction();
      const longChannelName = '가'.repeat(100);
      apiClient.getMeActivityDetail.mockResolvedValue(
        activityDetailResponse({
          voice: {
            totalSec: 5400,
            rank: 3,
            totalUsers: 42,
            upPercent: 8,
            channels: [
              { channelName: longChannelName, durationSec: 3600 },
              { channelName: longChannelName, durationSec: 1200 },
              { channelName: longChannelName, durationSec: 600 },
            ],
            activeDays: 5,
            avgDailySec: 1080,
            micUsageRate: 40,
          },
          message: {
            totalCount: 214,
            rank: 5,
            totalUsers: 38,
            upPercent: 14,
            channels: [
              { channelName: longChannelName, messageCount: 100 },
              { channelName: longChannelName, messageCount: 50 },
              { channelName: longChannelName, messageCount: 10 },
            ],
          },
        }),
      );

      await handler.handle(interaction);

      const json = embedJson(interaction);
      const fields = json.fields as Array<{ name: string; value: string }>;

      expect(fields[0].value.length).toBeLessThanOrEqual(1024);
      expect(fields[1].value.length).toBeLessThanOrEqual(1024);
      // 채널명이 32자에서 절단(…)되는지도 함께 확인한다(CHANNEL_NAME_MAX_LEN 방어)
      expect(fields[0].value).toContain(`${'가'.repeat(32)}…`);
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
      expect(fields[0].value).toBe(
        '1시간 30분\n서버 내 3위 / 42명 (상위 8%)\n📅 활동 5일 · 일평균 18분 · 🎤 마이크 40%',
      );
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

  describe('me:leaderboard 버튼 (F-VOICE-065, U9 S8 — 캔버스 이미지로 교체)', () => {
    it('deferReply({ephemeral:true})를 먼저 호출한다', async () => {
      const interaction = makeButtonInteraction({ customId: 'me:leaderboard' });
      apiClient.getLevelLeaderboardCard.mockResolvedValue(leaderboardCardResponse());

      await handler.handle(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });

    it('apiClient.getLevelLeaderboardCard를 guildId, page=1, limit=10, 클릭자 viewerUserId로 호출한다(페이지 버튼 없음, 페이지 1 고정)', async () => {
      const interaction = makeButtonInteraction({
        customId: 'me:leaderboard',
        guildId: 'guild-9',
        user: { id: 'clicker-1' },
      });
      apiClient.getLevelLeaderboardCard.mockResolvedValue(leaderboardCardResponse());

      await handler.handle(interaction);

      expect(apiClient.getLevelLeaderboardCard).toHaveBeenCalledWith({
        guildId: 'guild-9',
        page: 1,
        limit: 10,
        viewerUserId: 'clicker-1',
        locale: 'ko',
      });
    });

    it('정상 데이터면 캔버스 이미지 파일을 ephemeral로 editReply하고 embed/버튼을 붙이지 않는다', async () => {
      const interaction = makeButtonInteraction({ customId: 'me:leaderboard' });
      apiClient.getLevelLeaderboardCard.mockResolvedValue(leaderboardCardResponse());

      await handler.handle(interaction);

      const call = (interaction.editReply as Mock).mock.calls[0][0] as {
        files: Array<{ attachment: Buffer; name: string }>;
        embeds?: unknown;
        components?: unknown;
      };
      expect(call.files).toHaveLength(1);
      expect(call.files[0].name).toBe('leaderboard.png');
      expect(call.files[0].attachment.toString()).toBe('leaderboard-png');
      expect(call.embeds).toBeUndefined();
      expect(call.components).toBeUndefined();
    });

    it('isEnabled=false이면 기존 meLeaderboardDisabled 문구로 editReply한다(폴백 문구 회귀 없음)', async () => {
      const interaction = makeButtonInteraction({ customId: 'me:leaderboard' });
      apiClient.getLevelLeaderboardCard.mockResolvedValue(
        leaderboardCardResponse({ isEnabled: false, data: null }),
      );

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '이 서버는 레벨 시스템이 비활성화되어 있습니다.',
      });
    });

    it('활동 0명(data:null)이면 leaderboardEmpty 문구로 editReply한다(범위 초과 분기 없음 — 페이지 1 고정)', async () => {
      const interaction = makeButtonInteraction({ customId: 'me:leaderboard' });
      apiClient.getLevelLeaderboardCard.mockResolvedValue(
        leaderboardCardResponse({ data: null, total: 0 }),
      );

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '아직 순위에 오른 멤버가 없습니다.',
      });
    });

    it('렌더 실패(ok:false)이면 기존 일반 오류 문구로 editReply한다(5xx 아님, 200 + ok:false 폴백)', async () => {
      const interaction = makeButtonInteraction({ customId: 'me:leaderboard' });
      apiClient.getLevelLeaderboardCard.mockResolvedValue(
        leaderboardCardResponse({ ok: false, data: null }),
      );

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '조회 중 오류가 발생했습니다.',
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
      apiClient.getLevelLeaderboardCard.mockRejectedValue(new Error('API 500'));

      await handler.handle(interaction);

      expect(interaction.followUp).toHaveBeenCalledWith({
        ephemeral: true,
        content: '조회 중 오류가 발생했습니다.',
      });
    });
  });
});
