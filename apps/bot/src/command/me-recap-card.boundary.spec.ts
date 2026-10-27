/**
 * me-recap-card 보강 스펙 (T-b 보강) — 창 경계 양끝 포함(VP-01-04)과 plan P-40 확정 안내 문구.
 * 기본 흐름은 me-recap-card.spec.ts 가 이미 덮는다 — 여기서는 그 스펙이 단언하지 않는 경계·문서 문구만 다룬다.
 */
import type { Logger } from '@nestjs/common';
import type { BotApiClientService } from '@onyu/bot-api-client';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../common/application/bot-i18n.service';
import {
  buildRecapSummaryContent,
  buildRecapWindowNotice,
  handleRecapView,
  RECAP_NOW_OVERRIDE_ENV,
  resolveRecapFallbackNotice,
} from './me-recap-card';

function makeInteraction(): ChatInputCommandInteraction {
  return {
    guildId: 'guild-1',
    user: { id: 'user-1', displayName: 'Alice', displayAvatarURL: () => 'https://cdn/a.png' },
    member: { displayName: 'Alice' } as unknown as GuildMember,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    deleteReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction;
}

describe('me-recap-card 보강', () => {
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
    i18n = new BotI18nService();
    i18n.onModuleInit();
    apiClient = {
      getRecapCard: vi.fn().mockResolvedValue({
        ok: true,
        status: 'ready',
        data: { imageBase64: Buffer.from('png').toString('base64') },
        summary: {
          year: 2026,
          hero: { kind: 'voice', unit: 'hour', value: 3 },
          messageCount: 0,
          activityType: null,
          activityTypeLabel: null,
        },
      }),
    };
    logger = { warn: vi.fn(), error: vi.fn() };
    vi.stubEnv('NODE_ENV', 'test');
    delete process.env[RECAP_NOW_OVERRIDE_ENV];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    delete process.env[RECAP_NOW_OVERRIDE_ENV];
  });

  describe('창 경계 (KST 달력 일자, 양끝 포함 — VP-01-04)', () => {
    it.each([
      ['2026-12-14T23:59:59.999+09:00', false],
      ['2026-12-15T00:00:00.000+09:00', true],
      ['2027-01-15T23:59:59.999+09:00', true],
      ['2027-01-16T00:00:00.000+09:00', false],
    ])('%s → API 호출 %s', async (iso, isOpen) => {
      vi.setSystemTime(new Date(iso));
      const interaction = makeInteraction();

      await run(interaction);

      if (isOpen) {
        expect(interaction.deferReply).toHaveBeenCalledTimes(1);
        expect(apiClient.getRecapCard).toHaveBeenCalledTimes(1);
        expect(interaction.reply).not.toHaveBeenCalled();
      } else {
        expect(interaction.deferReply).not.toHaveBeenCalled();
        expect(apiClient.getRecapCard).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith(
          expect.objectContaining({ ephemeral: true }),
        );
      }
    });

    it('창 안에서는 ephemeral reply 를 쓰지 않고 공개 editReply 만 쓴다', async () => {
      vi.setSystemTime(new Date('2026-12-20T12:00:00+09:00'));
      const interaction = makeInteraction();

      await run(interaction);

      expect(interaction.reply).not.toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledTimes(1);
      expect(interaction.followUp).not.toHaveBeenCalled();
    });

    it('QA 오버라이드(RECAP_NOW_OVERRIDE)는 비-production 에서 창 판정에 쓰인다', async () => {
      vi.setSystemTime(new Date('2026-06-01T00:00:00+09:00'));
      process.env[RECAP_NOW_OVERRIDE_ENV] = '2026-12-20T12:00:00+09:00';
      const interaction = makeInteraction();

      await run(interaction);

      expect(apiClient.getRecapCard).toHaveBeenCalledTimes(1);
    });

    it('production 에서는 오버라이드가 있어도 실제 시각으로 창을 판정한다', async () => {
      vi.setSystemTime(new Date('2026-06-01T00:00:00+09:00'));
      process.env[RECAP_NOW_OVERRIDE_ENV] = '2026-12-20T12:00:00+09:00';
      vi.stubEnv('NODE_ENV', 'production');
      const interaction = makeInteraction();

      await run(interaction);

      expect(apiClient.getRecapCard).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledTimes(1);
    });
  });

  describe('요약 한 줄', () => {
    it('E2 메시지 히어로 · 유형 있음 → "{year} 결산 · 메시지 N개 · 유형"', () => {
      expect(
        buildRecapSummaryContent(i18n, 'ko', {
          year: 2026,
          hero: { kind: 'message', unit: 'message', value: 1234 },
          messageCount: 1234,
          activityType: 'steady',
          activityTypeLabel: '꾸준형',
        }),
      ).toBe('2026 결산 · 메시지 1,234개 · 꾸준형');
    });
  });

  describe('안내 문구 — plan P-40 확정 문구', () => {
    it('창 시작 전(ko): "2026 결산은 12월 15일에 열려요."', () => {
      expect(buildRecapWindowNotice(i18n, 'ko', 'not_started')).toBe(
        '2026 결산은 12월 15일에 열려요.',
      );
    });

    it('창 종료 후(ko): "2026 결산은 종료됐어요."', () => {
      expect(buildRecapWindowNotice(i18n, 'ko', 'ended')).toBe('2026 결산은 종료됐어요.');
    });

    it('오류(ko): "결산을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."', () => {
      expect(
        resolveRecapFallbackNotice(i18n, 'ko', {
          ok: false,
          status: 'ready',
          data: null,
          summary: null,
        }),
      ).toBe('결산을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    });
  });
});
