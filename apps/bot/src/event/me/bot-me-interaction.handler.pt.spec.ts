/**
 * BotMeInteractionHandler pt 응답 — pt-BR interaction 의 "활동 상세" 버튼이 pt 라벨·문구·시간 표기를 쓰는지
 * 고정한다(i18n-pt-br-bot, F-GENERAL-007 요구 8). 시간 표기 `{hours}h {minutes}min` 은 TS 테이블 pt 값이다.
 */
import type { BotApiClientService, MeActivityDetailResponse } from '@onyu/bot-api-client';
import type { ButtonInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { BotMeInteractionHandler } from './bot-me-interaction.handler';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';
const SEC_1H30M = 5400;
const SEC_18M = 1080;

function makeButtonInteraction(overrides: Record<string, unknown> = {}): ButtonInteraction {
  return {
    isButton: () => true,
    customId: 'me:activity_detail',
    user: { id: USER_ID },
    guildId: GUILD_ID,
    locale: 'pt-BR',
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

function detailResponse(
  data: Partial<MeActivityDetailResponse['data']> = {},
): MeActivityDetailResponse {
  return {
    ok: true,
    days: 15,
    data: {
      voice: {
        totalSec: SEC_1H30M,
        rank: 3,
        totalUsers: 42,
        upPercent: 8,
        channels: [{ channelName: 'general', durationSec: SEC_18M }],
        activeDays: 5,
        avgDailySec: SEC_18M,
        micUsageRate: 40,
      },
      message: {
        totalCount: 214,
        rank: 5,
        totalUsers: 38,
        upPercent: 14,
        channels: [],
        activeDays: 4,
        avgDailyCount: 53,
      },
      ...data,
    },
  } as unknown as MeActivityDetailResponse;
}

interface EmbedField {
  name: string;
  value: string;
}

function embedFields(interaction: ButtonInteraction): { fields: EmbedField[]; footer: string } {
  const call = (interaction.editReply as Mock).mock.calls[0][0] as {
    embeds: Array<{ toJSON: () => { fields: EmbedField[]; footer: { text: string } } }>;
  };
  const json = call.embeds[0].toJSON();
  return { fields: json.fields, footer: json.footer.text };
}

describe('BotMeInteractionHandler — pt-BR interaction', () => {
  let handler: BotMeInteractionHandler;
  let i18n: BotI18nService;
  let apiClient: { getMeActivityDetail: Mock; getLevelLeaderboardCard: Mock };

  beforeEach(() => {
    apiClient = {
      getMeActivityDetail: vi.fn().mockResolvedValue(detailResponse()),
      getLevelLeaderboardCard: vi.fn(),
    };
    i18n = new BotI18nService();
    i18n.onModuleInit();
    handler = new BotMeInteractionHandler(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
    );
  });

  it('필드 라벨과 푸터가 pt 문구다(en/ko 와 다르다)', async () => {
    const interaction = makeButtonInteraction();

    await handler.handle(interaction);

    const { fields, footer } = embedFields(interaction);
    expect(fields[0].name).toBe(i18n.t('pt', 'commands.meActivityVoiceLabel'));
    expect(fields[1].name).toBe(i18n.t('pt', 'commands.meActivityMessageLabel'));
    expect(footer).toBe(i18n.t('pt', 'commands.meActivityFooter'));
    expect(fields[0].name).not.toBe(i18n.t('en', 'commands.meActivityVoiceLabel'));
    expect(footer).not.toBe(i18n.t('en', 'commands.meActivityFooter'));
  });

  it('시간 표기는 "1h 30min" 이고 한국어 단위(시간·분)가 섞이지 않는다', async () => {
    const interaction = makeButtonInteraction();

    await handler.handle(interaction);

    const { fields } = embedFields(interaction);
    expect(fields[0].value.split('\n')[0]).toBe('1h 30min');
    expect(fields[0].value).toContain('18min');
    expect(fields[0].value).not.toContain('시간');
    expect(fields[0].value).not.toContain('분');
  });

  it('순위 줄이 pt 템플릿으로 치환된다(미치환 {x} 없음)', async () => {
    const interaction = makeButtonInteraction();

    await handler.handle(interaction);

    const { fields } = embedFields(interaction);
    const rankLine = i18n.t('pt', 'commands.meActivityRankLine', {
      rank: 3,
      total: 42,
      percent: 8,
    });
    expect(fields[0].value).toContain(rankLine);
    for (const field of fields) {
      expect(field.name).not.toMatch(/\{\w+\}/);
      expect(field.value).not.toMatch(/\{\w+\}/);
    }
  });

  it('데이터가 없으면 "기록 없음" 문구를 pt 로 표시한다', async () => {
    apiClient.getMeActivityDetail.mockResolvedValue(detailResponse({ voice: null }));
    const interaction = makeButtonInteraction();

    await handler.handle(interaction);

    const { fields } = embedFields(interaction);
    expect(fields[0].value).toBe(i18n.t('pt', 'commands.meActivityNone'));
    expect(fields[0].value).not.toBe(i18n.t('en', 'commands.meActivityNone'));
  });
});
