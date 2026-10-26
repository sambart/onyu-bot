/**
 * `/관리도우미` Phase 3 봇 표면 갭 보강 (QA P3-145·146·147·149·151·152 / UC-12 / T-7).
 * 봇은 read-only 를 유지한다 — 승인 버튼·컴포넌트·E9 호출이 0이고, 웹 승인 안내 1줄만 붙는다.
 * 기존 `admin-assist-embed.builder.spec.ts` (Phase 3 블록) 가 다루지 않은 케이스만 채운다.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { AdminAssistRecommendationResult, BotApiClientService } from '@onyu/bot-api-client';
import type { AdminAssistRecommendResponse } from '@onyu/shared';
import { ADMIN_ASSIST_EXECUTABLE_ACTION_IDS } from '@onyu/shared';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { AdminAssistCommand } from './admin-assist.command';
import { AdminAssistCommandDto } from './admin-assist.dto';
import { buildAdminAssistEmbed } from './admin-assist-embed.builder';

const GUILD_ID = 'guild-1';
const WEB_URL = 'https://onyu.dev';
const KO_HINT = '웹 대시보드의 어시스턴트에서 변경 내용을 확인하고 적용할 수 있어요.';
const EN_HINT = 'You can review and apply this change from the assistant in the web dashboard.';
const EMBED_TOTAL_LIMIT = 6000;

function makeResponse(
  overrides: Partial<AdminAssistRecommendResponse> = {},
): AdminAssistRecommendResponse {
  return {
    resultStatus: 'success',
    kind: 'setting',
    recommendation: {
      actionId: 'level.enable',
      title: '레벨 시스템',
      description: '레벨 시스템을 꺼 두는 걸 추천해요.',
      settingsDeepLink: `/settings/guild/${GUILD_ID}/level`,
      parameters: [
        { key: 'isEnabled', label: '레벨 시스템 사용', value: false, isValidated: true },
      ],
    },
    analysis: null,
    generation: null,
    fallback: null,
    historyId: '1',
    followUpQueries: [],
    quota: {
      scope: 'admin-assist',
      used: 1,
      limit: 20,
      resetAt: '2026-10-21T00:00:00.000Z',
      isAvailable: true,
    },
    ...overrides,
  };
}

interface EmbedJsonLike {
  title?: string;
  description?: string;
  fields?: Array<{ name: string; value: string }>;
  footer?: { text: string };
  author?: { name: string };
}

/** Discord Embed 총량 = title+description+모든 field name/value+footer+author 합 */
function embedTotalLength(json: EmbedJsonLike): number {
  return (
    (json.title?.length ?? 0) +
    (json.description?.length ?? 0) +
    (json.fields?.reduce((sum, field) => sum + field.name.length + field.value.length, 0) ?? 0) +
    (json.footer?.text.length ?? 0) +
    (json.author?.name.length ?? 0)
  );
}

describe('/관리도우미 Phase 3 봇 표면 (read-only 유지)', () => {
  let i18n: BotI18nService;

  beforeEach(() => {
    i18n = new BotI18nService();
    i18n.onModuleInit();
  });

  function fieldValues(
    response: AdminAssistRecommendResponse,
    locale: 'ko' | 'en' = 'ko',
  ): string[] {
    const json = buildAdminAssistEmbed(response, {
      locale,
      i18n,
      webUrl: WEB_URL,
      guildId: GUILD_ID,
    }).toJSON();
    return (json.fields ?? []).map((field) => field.value);
  }

  describe('P3-146 — 안내 문구 ko/en 키 동기화', () => {
    it('ko 와 en 의 commands.adminAssistApplyOnWebHint 가 모두 실재하고 서로 다르다', () => {
      const ko = i18n.t('ko', 'commands.adminAssistApplyOnWebHint');
      const en = i18n.t('en', 'commands.adminAssistApplyOnWebHint');

      expect(ko).toBe(KO_HINT);
      expect(en).toBe(EN_HINT);
      expect(ko).not.toBe(en);
    });
  });

  describe('P3-147 — 안내 줄이 붙지 않아야 하는 카드', () => {
    it.each([
      'newbie.welcome',
      'newbie.period',
      'auto-channel.enable',
      'sticky-message.enable',
      'role-panel.create',
    ])('등급 ③ 항목(%s)에는 안내 줄이 없다', (actionId) => {
      const response = makeResponse({
        recommendation: {
          actionId,
          title: '제목',
          description: '설명',
          settingsDeepLink: `/settings/guild/${GUILD_ID}/x`,
          parameters: [],
        },
      });

      expect(fieldValues(response)).not.toContain(KO_HINT);
    });

    it('생성형(generative) 카드에는 안내 줄이 없다', () => {
      const response = makeResponse({
        kind: 'generative',
        recommendation: null,
        generation: {
          title: '공지 초안',
          writeLocale: 'ko',
          parameters: [],
          notices: [],
          action: 'generate.announcementDraft',
          draft: { title: '제목', body: '본문' },
        },
      });

      expect(fieldValues(response)).not.toContain(KO_HINT);
    });
  });

  describe('P3-151 — 값을 말하지 않은 등급 ① 질의', () => {
    it('파라미터가 전부 미검증이어도 안내 줄은 붙는다 (문구가 "확인하고 적용할 수 있어요"라 사실과 어긋나지 않음 — 수용)', () => {
      const response = makeResponse({
        recommendation: {
          actionId: 'inactive-member.criteria',
          title: '비활동 기준',
          description: '기준을 조정해 보세요.',
          settingsDeepLink: `/settings/guild/${GUILD_ID}/inactive-member`,
          parameters: [
            { key: 'periodDays', label: '비활동 판정 기간(일)', value: null, isValidated: false },
          ],
        },
      });

      expect(fieldValues(response)).toContain(KO_HINT);
    });
  });

  describe('P3-152 — 최장 조합에서도 Embed 총량 6000자 이내', () => {
    it('긴 설명 + 후속 질문 8개 + 안내 1줄을 더해도 총량 상한을 지키고 안내 줄이 보존된다', () => {
      const response = makeResponse({
        recommendation: {
          actionId: 'level.enable',
          title: '가'.repeat(200),
          description: '나'.repeat(4000),
          settingsDeepLink: `/settings/guild/${GUILD_ID}/level`,
          parameters: Array.from({ length: 10 }, (_, index) => ({
            key: `p${index}`,
            label: '라'.repeat(80),
            value: 7,
            isValidated: true,
          })),
        },
        followUpQueries: Array.from(
          { length: 8 },
          (_, index) => `${'후속 질문 '.repeat(20)}${index}`,
        ),
      });
      const embed = buildAdminAssistEmbed(response, {
        locale: 'ko',
        i18n,
        webUrl: WEB_URL,
        guildId: GUILD_ID,
      });

      expect(embedTotalLength(embed.toJSON())).toBeLessThanOrEqual(EMBED_TOTAL_LIMIT);
      expect((embed.toJSON().fields ?? []).map((field) => field.value)).toContain(KO_HINT);
    });
  });

  describe('P3-149 — 커맨드 정의: 옵션 query 1개, 컴포넌트 0', () => {
    it('커맨드 옵션 선언(@Param)은 query 하나뿐이다', () => {
      const dtoSource = readFileSync(path.join(__dirname, 'admin-assist.dto.ts'), 'utf-8');

      expect(dtoSource.match(/@Param\(/g)).toHaveLength(1);
      expect(dtoSource).toContain("name: 'query'");
    });

    it('커맨드·Embed 빌더 소스에 버튼/액션 로우/셀렉트 등 컴포넌트 생성 코드가 없다 (T-7)', () => {
      const sources = ['admin-assist.command.ts', 'admin-assist-embed.builder.ts'].map((file) =>
        readFileSync(path.join(__dirname, file), 'utf-8'),
      );

      for (const source of sources) {
        expect(source).not.toMatch(
          /ActionRowBuilder|ButtonBuilder|StringSelectMenuBuilder|ModalBuilder/,
        );
      }
    });

    it('성공 응답을 editReply 할 때 components 를 싣지 않는다 (승인 버튼 0, 봇은 E9 를 호출하지 않는다)', async () => {
      const apiClient = {
        getAdminAssistRecommendation: vi
          .fn()
          .mockResolvedValue({ ok: true, data: makeResponse() } as AdminAssistRecommendationResult),
      };
      const command = new AdminAssistCommand(
        apiClient as unknown as BotApiClientService,
        i18n,
        new LocaleResolverService({
          getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
        } as unknown as BotApiClientService),
      );
      const interaction = {
        guildId: GUILD_ID,
        locale: 'ko',
        user: { id: 'user-1' },
        memberPermissions: { has: vi.fn().mockReturnValue(true) },
        options: { getString: vi.fn().mockReturnValue('레벨 시스템 켜줘') },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
      } as unknown as ChatInputCommandInteraction;

      await command.onAdminAssist(interaction, new AdminAssistCommandDto());

      expect(interaction.deferReply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true }),
      );
      const payload = (interaction.editReply as Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('components');
      expect(Object.keys(apiClient)).toEqual(['getAdminAssistRecommendation']);
    });

    it('봇 API 클라이언트 표면에 승인-실행(execute) 메서드가 없다', async () => {
      const { BotApiClientService: Client } = await import('@onyu/bot-api-client');
      const methodNames = Object.getOwnPropertyNames(Client.prototype);

      expect(methodNames.filter((name) => /execute/i.test(name) && /assist/i.test(name))).toEqual(
        [],
      );
    });
  });

  describe('웹 승인 대상 목록 정합', () => {
    it('안내 줄은 shared 실행 허용 목록 3항목과 정확히 일치하는 actionId 에만 붙는다', () => {
      const withHint = [
        'inactive-member.criteria',
        'level.enable',
        'voice-health.badge',
        'newbie.welcome',
        'diagnosis.weeklyReport',
      ].filter((actionId) =>
        fieldValues(
          makeResponse({
            recommendation: {
              actionId,
              title: '제목',
              description: '설명',
              settingsDeepLink: `/settings/guild/${GUILD_ID}/x`,
              parameters: [],
            },
          }),
        ).includes(KO_HINT),
      );

      expect([...withHint].sort()).toEqual([...ADMIN_ASSIST_EXECUTABLE_ACTION_IDS].sort());
    });
  });
});
