/**
 * buildAdminAssistEmbed — C-lite 설명 슬롯(F-ADMIN-ASSIST-094) · (b1) 상태 점검(F-ADMIN-ASSIST-095)
 * 렌더 갭 (EC-AA-403·404·405·406·407). 기본 렌더 회귀는 admin-assist-embed.builder.spec.ts 소관이고,
 * 여기는 필드 구성 경계·상태 아이콘 전수·가이드 링크 규칙·6000자 총량 상호작용을 고정한다.
 */
import type {
  AdminAssistDiagnosis,
  AdminAssistDiagnosisStatus,
  AdminAssistExplanation,
  AdminAssistRecommendation,
  AdminAssistRecommendResponse,
} from '@onyu/shared';
import { embedLength } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import type { AdminAssistEmbedContext } from './admin-assist-embed.builder';
import { buildAdminAssistEmbed } from './admin-assist-embed.builder';

const GUILD_ID = 'guild-1';
const WEB_URL = 'https://onyu.dev';
const EMBED_TOTAL_MAX = 6000;
const FIELD_VALUE_MAX = 1024;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const EXPLANATION_NAME = '📘 이 기능은';
const TROUBLESHOOTING_NAME = '🧰 작동하지 않을 때 확인할 것';
const DIAGNOSIS_NAME = '🩺 지금 서버 상태';

const BASE_QUOTA = {
  scope: 'admin-assist' as const,
  used: 1,
  limit: 20,
  resetAt: '2026-10-08T00:00:00.000Z',
  isAvailable: true,
};

function makeResponse(
  overrides: Partial<AdminAssistRecommendResponse> = {},
): AdminAssistRecommendResponse {
  return {
    resultStatus: 'success',
    kind: 'setting',
    recommendation: null,
    analysis: null,
    generation: null,
    fallback: null,
    historyId: '1',
    followUpQueries: [],
    quota: BASE_QUOTA,
    ...overrides,
  };
}

const recommendation: AdminAssistRecommendation = {
  actionId: 'level.enable',
  title: '레벨 시스템',
  description:
    '레벨 시스템 기능을 안내해 드릴게요. 이 카드는 안내라서 설정이 바로 바뀌지는 않아요.',
  settingsDeepLink: '/settings/guild/guild-1/level',
  parameters: [{ key: 'isEnabled', label: '레벨 시스템 사용', value: null, isValidated: false }],
};

function makeExplanation(overrides: Partial<AdminAssistExplanation> = {}): AdminAssistExplanation {
  return { body: '설명 본문', troubleshooting: [], guideSlug: null, ...overrides };
}

function makeDiagnosis(overrides: Partial<AdminAssistDiagnosis> = {}): AdminAssistDiagnosis {
  return {
    domain: 'level',
    outcome: 'evaluated',
    items: [{ code: 'LV_ENABLED', status: 'ok', text: '켜져 있어요.' }],
    selfCheckHint: null,
    ...overrides,
  };
}

describe('buildAdminAssistEmbed — 설명·상태 점검 필드 구성', () => {
  let context: AdminAssistEmbedContext;

  beforeEach(() => {
    const i18n = new BotI18nService();
    i18n.onModuleInit();
    context = { locale: 'ko', i18n, webUrl: WEB_URL, guildId: GUILD_ID };
  });

  const build = (response: AdminAssistRecommendResponse, ctx: AdminAssistEmbedContext = context) =>
    buildAdminAssistEmbed(response, ctx).toJSON();
  const fieldNames = (embed: ReturnType<typeof build>) => embed.fields?.map((f) => f.name) ?? [];

  describe('체크리스트(🧰) 필드', () => {
    it('troubleshooting 이 빈 배열이면 🧰 필드가 없다(진단과 중복 금지, EC-AA-403)', () => {
      const embed = build(
        makeResponse({ recommendation, explanation: makeExplanation({ troubleshooting: [] }) }),
      );
      expect(fieldNames(embed)).toContain(EXPLANATION_NAME);
      expect(fieldNames(embed)).not.toContain(TROUBLESHOOTING_NAME);
    });

    it('설명 + 진단 동시(체크리스트 빈 배열) — 📘 와 🩺 만 있고 🧰 는 없다', () => {
      const embed = build(
        makeResponse({
          recommendation: { ...recommendation, diagnosis: makeDiagnosis() },
          explanation: makeExplanation(),
        }),
      );
      const names = fieldNames(embed);
      expect(names).toContain(EXPLANATION_NAME);
      expect(names).toContain(DIAGNOSIS_NAME);
      expect(names).not.toContain(TROUBLESHOOTING_NAME);
    });

    it('9줄 이상이어도 불릿은 8줄까지만 렌더한다', () => {
      const lines = Array.from({ length: 10 }, (_, index) => `확인 ${index + 1}`);
      const embed = build(
        makeResponse({
          recommendation,
          explanation: makeExplanation({ troubleshooting: lines }),
        }),
      );
      const value = embed.fields?.find((f) => f.name === TROUBLESHOOTING_NAME)?.value ?? '';
      expect(value.split('\n')).toEqual(lines.slice(0, 8).map((line) => `• ${line}`));
    });
  });

  describe('설명(📘) 필드 길이', () => {
    it('1024자 이하는 그대로, 초과는 1024자(코드포인트)로 절단하고 말줄임표를 붙인다', () => {
      const exact = '가'.repeat(FIELD_VALUE_MAX);
      const over = '가'.repeat(FIELD_VALUE_MAX + 1);

      const exactValue = build(
        makeResponse({ recommendation, explanation: makeExplanation({ body: exact }) }),
      ).fields?.find((f) => f.name === EXPLANATION_NAME)?.value;
      const overValue = build(
        makeResponse({ recommendation, explanation: makeExplanation({ body: over }) }),
      ).fields?.find((f) => f.name === EXPLANATION_NAME)?.value;

      expect(exactValue).toBe(exact);
      expect(Array.from(overValue ?? '')).toHaveLength(FIELD_VALUE_MAX);
      expect(overValue?.endsWith('…')).toBe(true);
    });

    it('경계에 이모지(서로게이트 페어)가 걸려도 Embed 조립이 throw 하지 않고 Discord 길이(UTF-16 1024) 이내다', () => {
      // Discord/@discordjs/builders 는 필드 값 길이를 UTF-16 코드유닛으로 검증한다.
      const body = `${'a'.repeat(FIELD_VALUE_MAX - 2)}😀😀😀`;
      const response = makeResponse({
        recommendation,
        explanation: makeExplanation({ body }),
      });

      expect(() => build(response)).not.toThrow();
      const value = build(response).fields?.find((f) => f.name === EXPLANATION_NAME)?.value ?? '';
      expect(value.length).toBeLessThanOrEqual(FIELD_VALUE_MAX);
      expect(value).not.toMatch(LONE_SURROGATE);
    });
  });

  describe('상태 점검(🩺) 줄', () => {
    it.each([
      ['issue', '⚠️'],
      ['ok', '✅'],
      ['check', '🔍'],
      ['info', 'ℹ️'],
    ] as const satisfies ReadonlyArray<readonly [AdminAssistDiagnosisStatus, string]>)(
      '상태 %s → 아이콘 %s 로 시작한다',
      (status, icon) => {
        const embed = build(
          makeResponse({
            recommendation: {
              ...recommendation,
              diagnosis: makeDiagnosis({ items: [{ code: 'X', status, text: '문장' }] }),
            },
          }),
        );
        expect(embed.fields?.find((f) => f.name === DIAGNOSIS_NAME)?.value).toBe(`${icon} 문장`);
      },
    );

    it('evaluated + selfCheckHint=null — 안내 1줄도 👤 줄도 없다', () => {
      const value = build(
        makeResponse({ recommendation: { ...recommendation, diagnosis: makeDiagnosis() } }),
      ).fields?.find((f) => f.name === DIAGNOSIS_NAME)?.value;
      expect(value).toBe('✅ 켜져 있어요.');
      expect(value).not.toContain('👤');
      expect(value).not.toContain('확인하지 못했어요');
    });

    it('selfCheckHint 가 있으면 마지막 줄에 👤 로 붙는다', () => {
      const value = build(
        makeResponse({
          recommendation: {
            ...recommendation,
            diagnosis: makeDiagnosis({ selfCheckHint: '본인 확인 경로' }),
          },
        }),
      ).fields?.find((f) => f.name === DIAGNOSIS_NAME)?.value;
      expect(value?.split('\n').at(-1)).toBe('👤 본인 확인 경로');
    });

    it('unavailable + selfCheckHint — 안내 → 항목 → 👤 순서', () => {
      const value = build(
        makeResponse({
          recommendation: {
            ...recommendation,
            diagnosis: makeDiagnosis({
              outcome: 'unavailable',
              items: [{ code: 'STATIC_CHECK_1', status: 'check', text: '체크 1' }],
              selfCheckHint: '힌트',
            }),
          },
        }),
      ).fields?.find((f) => f.name === DIAGNOSIS_NAME)?.value;
      expect(value?.split('\n')).toEqual([
        '지금은 상태를 확인하지 못했어요. 아래 항목을 직접 확인해 주세요.',
        '🔍 체크 1',
        '👤 힌트',
      ]);
    });

    it('항목이 9개여도 8줄까지만 렌더한다', () => {
      const items = Array.from({ length: 9 }, (_, index) => ({
        code: `C${index}`,
        status: 'check' as const,
        text: `항목 ${index + 1}`,
      }));
      const value = build(
        makeResponse({
          recommendation: { ...recommendation, diagnosis: makeDiagnosis({ items }) },
        }),
      ).fields?.find((f) => f.name === DIAGNOSIS_NAME)?.value;
      expect(value?.split('\n')).toHaveLength(8);
      expect(value).not.toContain('항목 9');
    });

    it('en 응답 — 필드 이름·unavailable 안내가 영어 라벨이다', () => {
      const i18n = new BotI18nService();
      i18n.onModuleInit();
      const embed = build(
        makeResponse({
          recommendation: {
            ...recommendation,
            diagnosis: makeDiagnosis({
              outcome: 'unavailable',
              items: [{ code: 'STATIC_CHECK_1', status: 'check', text: 'Check 1' }],
            }),
          },
        }),
        { ...context, i18n, locale: 'en' },
      );
      const field = embed.fields?.find((f) => f.name === '🩺 Current server status');
      expect(field?.value.split('\n')[0]).toBe(
        "We couldn't check the current status right now. Please check these items yourself.",
      );
    });
  });

  describe('가이드 링크(🔗 필드)', () => {
    const linkValueOf = (embed: ReturnType<typeof build>) =>
      embed.fields?.find((f) => f.name === '🔗')?.value ?? '';

    it('ko — /guides/{slug}, en — /en/guides/{slug}, pt — /pt, ja — /ja 접두', () => {
      const i18n = new BotI18nService();
      i18n.onModuleInit();
      const response = makeResponse({
        recommendation,
        explanation: makeExplanation({ guideSlug: 'voice-tracking' }),
      });
      expect(linkValueOf(build(response))).toContain(`📖 가이드: ${WEB_URL}/guides/voice-tracking`);
      expect(linkValueOf(build(response, { ...context, i18n, locale: 'en' }))).toContain(
        `📖 Guide: ${WEB_URL}/en/guides/voice-tracking`,
      );
      expect(linkValueOf(build(response, { ...context, i18n, locale: 'pt' }))).toContain(
        `${WEB_URL}/pt/guides/voice-tracking`,
      );
      expect(linkValueOf(build(response, { ...context, i18n, locale: 'ja' }))).toContain(
        `${WEB_URL}/ja/guides/voice-tracking`,
      );
    });

    it('guideSlug=null 이면 가이드 줄이 없고 개요·설정 링크만 남는다', () => {
      const value = linkValueOf(
        build(makeResponse({ recommendation, explanation: makeExplanation({ guideSlug: null }) })),
      );
      expect(value).not.toContain('/guides/');
      expect(value).toContain(`${WEB_URL}/dashboard/guild/${GUILD_ID}/overview`);
      expect(value).toContain(`${WEB_URL}/settings/guild/guild-1/level`);
    });

    it.each(['../etc/passwd', 'Voice-Tracking', 'a b', 'a/b', 'slug?x=1', ''])(
      '형식 위반 slug(%j)는 링크를 만들지 않는다',
      (guideSlug) => {
        const value = linkValueOf(
          build(makeResponse({ recommendation, explanation: makeExplanation({ guideSlug }) })),
        );
        expect(value).not.toContain('/guides/');
      },
    );

    it('가이드 링크는 개요 링크·설정 링크와 한 🔗 필드에 함께 있고 🔗 가 마지막 필드다', () => {
      const embed = build(
        makeResponse({
          recommendation: { ...recommendation, diagnosis: makeDiagnosis() },
          explanation: makeExplanation({ troubleshooting: ['a'], guideSlug: 'newbie' }),
          followUpQueries: ['후속 질문'],
        }),
      );
      const value = linkValueOf(embed);
      expect(value).toContain(`${WEB_URL}/dashboard/guild/${GUILD_ID}/overview`);
      expect(value).toContain(`${WEB_URL}/settings/guild/guild-1/level`);
      expect(value).toContain(`${WEB_URL}/guides/newbie`);
      expect(fieldNames(embed).at(-1)).toBe('🔗');
    });
  });

  describe('파라미터 필드 숨김/유지 (EC-AA-404)', () => {
    it('검증된 값이 하나라도 있으면 설명형 카드에서도 파라미터 필드를 유지한다(오라벨 방어)', () => {
      const embed = build(
        makeResponse({
          recommendation: {
            ...recommendation,
            parameters: [
              { key: 'isEnabled', label: '레벨 시스템 사용', value: null, isValidated: false },
              { key: 'msgXp', label: '메시지 XP', value: 7, isValidated: true },
            ],
          },
          explanation: makeExplanation(),
        }),
      );
      const parameterField = embed.fields?.find((f) => f.name === '레벨 시스템');
      expect(parameterField?.value).toBe('• 레벨 시스템 사용: —\n• 메시지 XP: 7');
    });

    it('explanation 이 없으면 전부 미검증이어도 파라미터 필드를 그대로 둔다(기존 카드 무변경)', () => {
      const embed = build(makeResponse({ recommendation }));
      // Phase 3 — level.enable 은 웹 승인 대상이라 setting 성공 카드에 웹 안내 필드('🖥️') 1개가 추가된다(그 외 구성은 불변).
      expect(fieldNames(embed)).toEqual(['레벨 시스템', '🖥️', '🔗']);
    });

    it('파라미터가 아예 없는 추천 + 설명 — 오류 없이 📘 만 추가된다', () => {
      const embed = build(
        makeResponse({
          recommendation: { ...recommendation, parameters: [] },
          explanation: makeExplanation(),
        }),
      );
      expect(fieldNames(embed)).toEqual([EXPLANATION_NAME, '🔗']);
    });

    it('boolean false 값("꺼짐")은 미검증(—)이 아니라 값이므로 필드를 유지한다', () => {
      const embed = build(
        makeResponse({
          recommendation: {
            ...recommendation,
            parameters: [{ key: 'isEnabled', label: '사용', value: false, isValidated: true }],
          },
          explanation: makeExplanation(),
        }),
      );
      expect(embed.fields?.find((f) => f.name === '레벨 시스템')?.value).toBe('• 사용: false');
    });
  });

  describe('렌더 대상이 아닌 경로 — 필드 무시 (EC-AA-407/408)', () => {
    it('diagnosis 만 있고 explanation 이 없으면 📘·🧰 는 없고 🩺 만 있다', () => {
      const embed = build(
        makeResponse({ recommendation: { ...recommendation, diagnosis: makeDiagnosis() } }),
      );
      expect(fieldNames(embed)).toContain(DIAGNOSIS_NAME);
      expect(fieldNames(embed)).not.toContain(EXPLANATION_NAME);
      expect(fieldNames(embed)).not.toContain(TROUBLESHOOTING_NAME);
      expect(fieldNames(embed)).not.toContain('📖');
    });

    it('recommendation 이 null 인 setting 응답은 explanation 이 있어도 오류 안내만 렌더한다', () => {
      const embed = build(makeResponse({ recommendation: null, explanation: makeExplanation() }));
      expect(embed.description).toBe(context.i18n.t('ko', 'commands.adminAssistError'));
      expect(fieldNames(embed)).not.toContain(EXPLANATION_NAME);
    });

    it.each(['no_match', 'rejected'] as const)(
      '%s 응답에 explanation 이 섞여 있어도 📘 를 렌더하지 않는다',
      (resultStatus) => {
        const embed = build(
          makeResponse({
            resultStatus,
            kind: null,
            fallback: {
              generatedGuidance: '안내',
              supportedExamples: [],
              suggestedAction: null,
            } as never,
            explanation: makeExplanation(),
          }),
        );
        expect(fieldNames(embed)).not.toContain(EXPLANATION_NAME);
      },
    );

    it('llm_error 응답은 explanation 이 섞여 있어도 오류 안내뿐이다', () => {
      const embed = build(
        makeResponse({ resultStatus: 'llm_error', kind: null, explanation: makeExplanation() }),
      );
      expect(fieldNames(embed)).not.toContain(EXPLANATION_NAME);
    });
  });

  describe('Embed 6000자 총량 가드와의 상호작용 (EC-AA-406)', () => {
    const LONG = '가'.repeat(2000);

    function makeWorstCase(locale: 'ko' | 'en'): AdminAssistRecommendResponse {
      return makeResponse({
        recommendation: {
          ...recommendation,
          description: LONG + LONG + LONG,
          diagnosis: makeDiagnosis({
            items: Array.from({ length: 7 }, (_, index) => ({
              code: `C${index}`,
              status: 'issue' as const,
              text: LONG,
            })),
            selfCheckHint: LONG,
          }),
        },
        explanation: makeExplanation({
          body: LONG,
          troubleshooting: Array.from({ length: 9 }, () => LONG),
          guideSlug: locale === 'ko' ? 'newbie' : 'auto-channel',
        }),
        followUpQueries: Array.from({ length: 8 }, () => LONG),
      });
    }

    it.each(['ko', 'en'] as const)(
      'locale=%s 최악 케이스(긴 설명+진단+체크리스트+후속질문+긴 description) — 총량 ≤ 6000',
      (locale) => {
        const i18n = new BotI18nService();
        i18n.onModuleInit();
        const builder = buildAdminAssistEmbed(makeWorstCase(locale), {
          ...context,
          i18n,
          locale,
        });
        expect(embedLength(builder.data)).toBeLessThanOrEqual(EMBED_TOTAL_MAX);
      },
    );

    it('총량 보정은 설명·진단·체크리스트·링크 필드를 줄이지 않고 후속질문·description 만 줄인다', () => {
      const embed = build(makeWorstCase('ko'));
      const byName = (name: string) => embed.fields?.find((f) => f.name === name);

      for (const name of [EXPLANATION_NAME, TROUBLESHOOTING_NAME, DIAGNOSIS_NAME]) {
        const value = byName(name)?.value ?? '';
        expect(Array.from(value).length, name).toBe(FIELD_VALUE_MAX);
        expect(value.endsWith('…'), name).toBe(true);
      }
      expect(byName('🔗')?.value).toContain(`${WEB_URL}/guides/newbie`);
      // description 이 추가 절단됐고 절단 힌트 필드가 있다
      expect(embed.description?.endsWith('…')).toBe(true);
      expect(fieldNames(embed)).toContain('—');
      // 후속질문 필드는 0줄까지 줄어 제거되거나 일부만 남는다 — 원본 8줄 그대로일 수는 없다
      const followUp = embed.fields?.find((f) => f.name === '이어서 물어볼 수 있는 질문');
      expect(followUp === undefined || followUp.value.split('\n').length < 8).toBe(true);
    });

    it('총량 이내의 일반 케이스는 보정(절단 힌트·말줄임)이 일어나지 않는다', () => {
      const embed = build(
        makeResponse({
          recommendation: { ...recommendation, diagnosis: makeDiagnosis() },
          explanation: makeExplanation({ troubleshooting: ['a', 'b'], guideSlug: 'newbie' }),
          followUpQueries: ['후속 1', '후속 2'],
        }),
      );
      expect(fieldNames(embed)).not.toContain('—');
      expect(embed.description).toBe(recommendation.description);
    });
  });
});
