import type { Logger } from '@nestjs/common';
import type { BotApiClientService, MeRecapBotResponse } from '@onyu/bot-api-client';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../common/application/bot-i18n.service';
import {
  buildRecapSummaryContent,
  handleRecapView,
  RECAP_NOW_OVERRIDE_ENV,
  resolveRecapNow,
} from './me-recap-card';

const GUILD_ID = 'guild-1';
const OPEN_NOW = new Date('2026-12-20T03:00:00Z');

function makeInteraction(): ChatInputCommandInteraction {
  return {
    guildId: GUILD_ID,
    user: { id: 'user-1', displayName: 'Alice', displayAvatarURL: () => 'https://cdn/a.png' },
    member: { displayName: 'Alice' } as unknown as GuildMember,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    deleteReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction;
}

function readyResponse(overrides: Partial<MeRecapBotResponse> = {}): MeRecapBotResponse {
  return {
    ok: true,
    status: 'ready',
    data: { imageBase64: Buffer.from('png').toString('base64') },
    summary: {
      year: 2026,
      hero: { kind: 'voice', unit: 'hour', value: 1234 },
      messageCount: 10,
      activityType: 'night-owl',
      activityTypeLabel: '올빼미',
    },
    ...overrides,
  };
}

describe('me-recap-card', () => {
  let i18n: BotI18nService;
  let apiClient: { getRecapCard: Mock };
  let logger: { warn: Mock; error: Mock };

  function run(interaction: ChatInputCommandInteraction, locale = 'ko'): Promise<void> {
    return handleRecapView({
      interaction,
      apiClient: apiClient as unknown as BotApiClientService,
      i18n,
      locale,
      logger: logger as unknown as Logger,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(OPEN_NOW);
    i18n = new BotI18nService();
    i18n.onModuleInit();
    apiClient = { getRecapCard: vi.fn().mockResolvedValue(readyResponse()) };
    logger = { warn: vi.fn(), error: vi.fn() };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    delete process.env[RECAP_NOW_OVERRIDE_ENV];
  });

  it('ready: 공개 editReply 로 recap.png + 한 줄 요약 + Link 버튼 1개를 보낸다(VP-01-01)', async () => {
    const interaction = makeInteraction();

    await run(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith();
    const payload = (interaction.editReply as Mock).mock.calls[0][0] as {
      content: string;
      files: Array<{ name: string }>;
      components: Array<{ components: Array<{ toJSON: () => Record<string, unknown> }> }>;
    };
    expect(payload.files[0].name).toBe('recap.png');
    expect(payload.content).toBe('2026 결산 · 1,234시간 · 올빼미');
    const buttons = payload.components[0].components.map((b) => b.toJSON());
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).not.toHaveProperty('custom_id');
    expect(String(buttons[0]['url'])).toContain(`/my/recap?guildId=${GUILD_ID}`);
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('창 시작 전이면 defer·API 호출 없이 ephemeral reply 한다', async () => {
    vi.setSystemTime(new Date('2026-12-14T14:59:59.999Z'));
    const interaction = makeInteraction();

    await run(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(apiClient.getRecapCard).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: '2026 결산은 12월 15일에 열려요.',
      ephemeral: true,
    });
  });

  it('창 종료 후면 defer·API 호출 없이 ephemeral reply 한다', async () => {
    vi.setSystemTime(new Date('2027-01-15T15:00:00.000Z'));
    const interaction = makeInteraction();

    await run(interaction);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(apiClient.getRecapCard).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: '2026 결산은 종료됐어요.',
      ephemeral: true,
    });
  });

  it('empty(E3): deleteReply 후 ephemeral followUp, 첨부·버튼 없음', async () => {
    apiClient.getRecapCard.mockResolvedValue({
      ok: true,
      status: 'empty',
      data: null,
      summary: null,
    });
    const interaction = makeInteraction();

    await run(interaction);

    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(interaction.deleteReply).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: '올해 기록이 아직 없어요.',
      ephemeral: true,
    });
  });

  it('ok:false: deleteReply 후 ephemeral 오류 안내', async () => {
    apiClient.getRecapCard.mockResolvedValue({
      ok: false,
      status: 'empty',
      data: null,
      summary: null,
    });
    const interaction = makeInteraction();

    await run(interaction);

    expect(interaction.deleteReply).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: '결산을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
      ephemeral: true,
    });
  });

  it('경계 경합(status=ended): ephemeral 창 문구', async () => {
    apiClient.getRecapCard.mockResolvedValue({
      ok: true,
      status: 'ended',
      data: null,
      summary: null,
    });
    const interaction = makeInteraction();

    await run(interaction);

    expect(interaction.followUp).toHaveBeenCalledWith({
      content: '2026 결산은 종료됐어요.',
      ephemeral: true,
    });
  });

  it('통신 예외: 전파하지 않고 ephemeral 오류 안내, deleteReply 실패는 warn 만', async () => {
    apiClient.getRecapCard.mockRejectedValue(new Error('network down'));
    const interaction = makeInteraction();
    (interaction.deleteReply as Mock).mockRejectedValue(new Error('unknown message'));

    await expect(run(interaction)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: '결산을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
      ephemeral: true,
    });
  });

  it('B1 요청에 viewOption·mentType 을 싣지 않는다(me-ment 쿼터 미소모)', async () => {
    await run(makeInteraction());

    const options = apiClient.getRecapCard.mock.calls[0][0] as Record<string, unknown>;
    expect(options).toEqual({
      guildId: GUILD_ID,
      userId: 'user-1',
      displayName: 'Alice',
      avatarUrl: 'https://cdn/a.png',
      locale: 'ko',
    });
  });

  describe('buildRecapSummaryContent', () => {
    it('활동 유형 라벨이 없으면 해당 구간을 생략한다', () => {
      const text = buildRecapSummaryContent(i18n, 'ko', {
        year: 2026,
        hero: { kind: 'message', unit: 'message', value: 5 },
        messageCount: 5,
        activityType: null,
        activityTypeLabel: null,
      });
      expect(text).toBe('2026 결산 · 메시지 5개');
    });

    it('분 단위 히어로는 분 키를 쓴다(en)', () => {
      const text = buildRecapSummaryContent(i18n, 'en', {
        year: 2026,
        hero: { kind: 'voice', unit: 'minute', value: 42 },
        messageCount: 0,
        activityType: 'x',
        activityTypeLabel: 'Night Owl',
      });
      expect(text).toBe('2026 Recap · 42 minutes · Night Owl');
    });
  });

  describe('resolveRecapNow (P-51)', () => {
    it('비-production 에서 유효한 오버라이드를 읽는다', () => {
      process.env[RECAP_NOW_OVERRIDE_ENV] = '2026-12-25T00:00:00Z';
      vi.stubEnv('NODE_ENV', 'test');
      expect(resolveRecapNow().toISOString()).toBe('2026-12-25T00:00:00.000Z');
    });

    it('production 에서는 오버라이드를 무시한다', () => {
      process.env[RECAP_NOW_OVERRIDE_ENV] = '2026-12-25T00:00:00Z';
      vi.stubEnv('NODE_ENV', 'production');
      expect(resolveRecapNow().toISOString()).toBe(OPEN_NOW.toISOString());
    });

    it('잘못된 ISO 는 현재 시각으로 폴백한다', () => {
      process.env[RECAP_NOW_OVERRIDE_ENV] = 'not-a-date';
      vi.stubEnv('NODE_ENV', 'test');
      expect(resolveRecapNow().toISOString()).toBe(OPEN_NOW.toISOString());
    });
  });
});
