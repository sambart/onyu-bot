/**
 * buildAdminAssistEmbed 단위 테스트 — 4분기(recommendation/analysis/generation/fallback) +
 * §9-3(HTTP 200 ≠ 결과 성공) + 코드포인트 절단(T7) 회귀 가드.
 * UC-08 TC-08-02·03·04·11~15 매핑(admin-assist-bot-entrypoint 계획 §11-7).
 */
import type {
  AdminAssistAnalysis,
  AdminAssistDiagnosis,
  AdminAssistFallback,
  AdminAssistGeneration,
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

const BASE_QUOTA = {
  scope: 'admin-assist' as const,
  used: 1,
  limit: 20,
  resetAt: '2026-09-22T00:00:00.000Z',
  isAvailable: true,
};

function makeResponse(
  overrides: Partial<AdminAssistRecommendResponse> = {},
): AdminAssistRecommendResponse {
  return {
    resultStatus: 'success',
    kind: null,
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

describe('buildAdminAssistEmbed', () => {
  let context: AdminAssistEmbedContext;

  beforeEach(() => {
    const i18n = new BotI18nService();
    i18n.onModuleInit();
    context = { locale: 'ko', i18n, webUrl: WEB_URL, guildId: GUILD_ID };
  });

  // ─── TC-08-01·04 — recommendation(setting) ─────────────────────────────────

  it('TC-08-01·04 — success+setting 이면 recommendation 을 렌더하고 개요 페이지 딥링크를 포함한다', () => {
    const recommendation: AdminAssistRecommendation = {
      actionId: 'newbie.welcome',
      title: '환영 메시지 설정',
      description: '환영 메시지를 이렇게 설정하는 걸 추천해요.',
      settingsDeepLink: '/settings/guild/guild-1/newbie',
      parameters: [{ key: 'enabled', label: '활성화', value: true, isValidated: true }],
    };
    const response = makeResponse({ kind: 'setting', recommendation });

    const embed = buildAdminAssistEmbed(response, context).toJSON();

    expect(embed.title).toBe('환영 메시지 설정');
    expect(embed.description).toBe('환영 메시지를 이렇게 설정하는 걸 추천해요.');
    const linkField = embed.fields?.find((f) =>
      f.value.includes(`${WEB_URL}/dashboard/guild/${GUILD_ID}/overview`),
    );
    expect(linkField).toBeDefined();
    const settingsLinkField = embed.fields?.find((f) =>
      f.value.includes(`${WEB_URL}/settings/guild/guild-1/newbie`),
    );
    expect(settingsLinkField).toBeDefined();
  });

  // ─── TC-08-02 — analysis(recipe) success/partial_success ──────────────────

  it('TC-08-02 — success+recipe 면 interpretation 을 description 으로 렌더한다', () => {
    const analysis: AdminAssistAnalysis = {
      recipe: 'analytics.activityTrend',
      title: '활동 추이',
      parameters: [],
      interpretation: '최근 활동이 늘었어요.',
      notices: [],
      metrics: {
        windowDays: 30,
        current: { voiceSeconds: 3600, micOnSeconds: 1800, messageCount: 50 },
        previous: { voiceSeconds: 1800, micOnSeconds: 900, messageCount: 20 },
        delta: { voiceSeconds: 1800, micOnSeconds: 900, messageCount: 30 },
        deltaPercent: { voiceSeconds: 100, micOnSeconds: 100, messageCount: 150 },
        isBothWindowsEmpty: false,
      },
    };
    const response = makeResponse({ kind: 'recipe', resultStatus: 'success', analysis });

    const embed = buildAdminAssistEmbed(response, context).toJSON();

    expect(embed.description).toBe('최근 활동이 늘었어요.');
    expect(embed.fields?.some((f) => f.value.includes('+100%'))).toBe(true);
  });

  it('TC-08-14 — partial_success 면 수치는 표시하되 interpretation 대신 안내 1줄을 보여준다(B4)', () => {
    const analysis: AdminAssistAnalysis = {
      recipe: 'analytics.newMemberCohort',
      title: '신규 멤버 코호트',
      parameters: [],
      interpretation: null,
      notices: ['interpretation_unavailable'],
      metrics: {
        windowDays: 7,
        joinCount: 10,
        youngAccountCount: 3,
        youngAccountThresholdDays: 7,
        burst: null,
        noActivityCount: 2,
        firstWeekVoiceMeasuredCount: 6,
        firstWeekVoice30PlusCount: 2,
        firstWeekVoiceUnder30Count: 4,
      },
    };
    const response = makeResponse({ kind: 'recipe', resultStatus: 'partial_success', analysis });

    const embed = buildAdminAssistEmbed(response, context).toJSON();

    expect(embed.description).not.toBeNull();
    expect(embed.description).not.toBe('');
    // interpretation 원문(null)이 아니라 안내 문구로 대체됐는지 확인
    expect(embed.fields?.some((f) => f.value.includes('10'))).toBe(true);
  });

  // ─── 8차 A4 — 해석 null 사유 구분(정상 부재 vs 해석 실패) ──────────────────

  describe('해석 null 사유 구분(success + no_comparable_data)', () => {
    const KO_NO_COMPARABLE =
      '비교할 이전 활동 데이터가 아직 없어요. 봇이 서버에 들어온 뒤부터 활동이 쌓이니 조금 지나 다시 물어봐 주세요.';
    const EN_NO_COMPARABLE =
      "There's no earlier activity data to compare against yet. Activity is collected after the bot joins the server, so please ask again a little later.";
    const KO_PARTIAL = '해석 문단을 만드는 데 실패했지만, 수치는 정상적으로 계산됐어요.';
    const EN_PARTIAL =
      "We couldn't generate the interpretation, but the numbers were calculated successfully.";

    function makeDecliningAnalysis(
      overrides: Partial<AdminAssistAnalysis> = {},
    ): AdminAssistAnalysis {
      return {
        recipe: 'analytics.decliningChannels',
        title: '감소 채널',
        parameters: [],
        interpretation: null,
        notices: [],
        metrics: {
          windowDays: 30,
          scope: 'all',
          requestedChannelId: null,
          limit: 5,
          channels: [],
        },
        ...overrides,
      } as AdminAssistAnalysis;
    }

    it('success + interpretation null + no_comparable_data(ko) 면 "비교 데이터 없음" 문구를 보여준다', () => {
      const analysis = makeDecliningAnalysis({ notices: ['no_comparable_data'] });
      const response = makeResponse({ kind: 'recipe', resultStatus: 'success', analysis });

      const embed = buildAdminAssistEmbed(response, context).toJSON();

      expect(embed.description).toBe(KO_NO_COMPARABLE);
    });

    it('success + interpretation null + no_comparable_data(en) 면 영어 "비교 데이터 없음" 문구를 보여준다', () => {
      const analysis = makeDecliningAnalysis({ notices: ['no_comparable_data'] });
      const response = makeResponse({ kind: 'recipe', resultStatus: 'success', analysis });

      const embed = buildAdminAssistEmbed(response, { ...context, locale: 'en' }).toJSON();

      expect(embed.description).toBe(EN_NO_COMPARABLE);
    });

    it('no_comparable_data 와 다른 notice 가 함께 있어도 새 문구를 보여준다', () => {
      const analysis = makeDecliningAnalysis({
        notices: ['channel_names_unavailable', 'no_comparable_data'],
      });
      const response = makeResponse({ kind: 'recipe', resultStatus: 'success', analysis });

      const embed = buildAdminAssistEmbed(response, context).toJSON();

      expect(embed.description).toBe(KO_NO_COMPARABLE);
    });

    it('success + interpretation null + no_comparable_data 없음(ko) 이면 기존 해석 실패 문구를 유지한다', () => {
      const analysis = makeDecliningAnalysis({ notices: [] });
      const response = makeResponse({ kind: 'recipe', resultStatus: 'success', analysis });

      const embed = buildAdminAssistEmbed(response, context).toJSON();

      expect(embed.description).toBe(KO_PARTIAL);
    });

    it('success + interpretation null + 다른 notice 만 있으면(en) 기존 해석 실패 문구를 유지한다', () => {
      const analysis = makeDecliningAnalysis({ notices: ['channel_names_unavailable'] });
      const response = makeResponse({ kind: 'recipe', resultStatus: 'success', analysis });

      const embed = buildAdminAssistEmbed(response, { ...context, locale: 'en' }).toJSON();

      expect(embed.description).toBe(EN_PARTIAL);
    });

    it('partial_success 는 no_comparable_data 가 있어도 해석 실패 문구를 쓴다(해석 콜 실패와 구분)', () => {
      const analysis = makeDecliningAnalysis({
        notices: ['no_comparable_data', 'interpretation_unavailable'],
      });
      const response = makeResponse({ kind: 'recipe', resultStatus: 'partial_success', analysis });

      const embed = buildAdminAssistEmbed(response, context).toJSON();

      expect(embed.description).toBe(KO_PARTIAL);
    });

    it('interpretation 이 있으면 no_comparable_data 가 있어도 해석문을 그대로 보여준다', () => {
      const analysis = makeDecliningAnalysis({
        interpretation: '해석문입니다.',
        notices: ['no_comparable_data'],
      });
      const response = makeResponse({ kind: 'recipe', resultStatus: 'success', analysis });

      const embed = buildAdminAssistEmbed(response, context).toJSON();

      expect(embed.description).toBe('해석문입니다.');
    });
  });

  // ─── TC-08-03 — generation(generative) — 게시 버튼 부재 필수 ───────────────

  it('TC-08-03 — success+generative 면 초안 텍스트만 렌더하고 게시 버튼·채널 선택 컴포넌트가 없다(read-only, B12)', () => {
    const generation: AdminAssistGeneration = {
      title: '공지 초안',
      writeLocale: 'ko',
      parameters: [],
      notices: [],
      action: 'generate.announcementDraft',
      draft: { title: '공지 제목', body: '공지 본문 초안입니다.' },
    };
    const response = makeResponse({ kind: 'generative', generation });

    const embed = buildAdminAssistEmbed(response, context);
    const json = embed.toJSON();

    expect(json.description).toBe('공지 본문 초안입니다.');
    // 🔒 EmbedBuilder 는 버튼을 포함하지 않는다(구조상 컴포넌트 필드 자체가 없음) — 별도 컴포넌트
    // 미첨부는 커맨드 레벨(editReply 호출)에서 검증되며, 여기서는 Embed 자체에 게시 관련
    // 필드(웹 안내)만 있고 "게시" 액션 트리거가 없음을 확인한다.
    expect(json.fields?.some((f) => f.value.includes(WEB_URL))).toBe(true);
  });

  // ─── TC-08-11·12 — fallback(no_match/rejected) ─────────────────────────────

  it('TC-08-11 — no_match 면 fallback.generatedGuidance + supportedExamples 를 렌더한다', () => {
    const fallback: AdminAssistFallback = {
      supportedExamples: ['서버 진단 리포트 보여줘', '신규 멤버 환영 메시지 설정해줘'],
      generatedGuidance: '요청하신 기능을 찾지 못했어요.',
      notices: [],
      suggestedActionId: null,
      suggestedAction: null,
    };
    const response = makeResponse({ resultStatus: 'no_match', kind: null, fallback });

    const embed = buildAdminAssistEmbed(response, context).toJSON();

    expect(embed.description).toContain('요청하신 기능을 찾지 못했어요.');
    expect(embed.description).toContain('서버 진단 리포트 보여줘');
  });

  it('B5 — suggestedAction 이 non-null 이면 서버가 조립한 settingsDeepLink 를 그대로 쓴다(봇이 경로를 조립하지 않는다)', () => {
    const fallback: AdminAssistFallback = {
      supportedExamples: [],
      generatedGuidance: null,
      notices: [],
      suggestedActionId: 'newbie.welcome',
      suggestedAction: { title: '환영 메시지', settingsDeepLink: '/settings/guild/guild-1/newbie' },
    };
    const response = makeResponse({ resultStatus: 'rejected', kind: null, fallback });

    const embed = buildAdminAssistEmbed(response, context).toJSON();

    expect(
      embed.fields?.some((f) => f.value.includes(`${WEB_URL}/settings/guild/guild-1/newbie`)),
    ).toBe(true);
  });

  // ─── TC-08-13 — 🔒 §9-3 HTTP 200 ≠ 결과 성공 (llm_error) ──────────────────

  it('TC-08-13 — resultStatus="llm_error"(HTTP 200) 면 빈 Embed 가 아니라 오류 문구를 렌더한다', () => {
    const response = makeResponse({ resultStatus: 'llm_error', kind: null });

    const embed = buildAdminAssistEmbed(response, context).toJSON();

    expect(embed.description).toBeDefined();
    expect(embed.description).not.toBe('');
    expect(embed.title).toBeUndefined();
  });

  // ─── TC-08-15 — Embed 상한 초과 절단 + 서로게이트 보존(T7) ─────────────────

  it('TC-08-15 — description 이 4096자를 초과하면 코드포인트 단위로 절단하고 안내 필드를 추가한다(크래시 없음)', () => {
    const longText = '가'.repeat(5000);
    const recommendation: AdminAssistRecommendation = {
      actionId: 'newbie.welcome',
      title: '제목',
      description: longText,
      settingsDeepLink: '/settings/guild/guild-1/newbie',
      parameters: [],
    };
    const response = makeResponse({ kind: 'setting', recommendation });

    const embed = buildAdminAssistEmbed(response, context).toJSON();

    expect(embed.description?.length).toBeLessThanOrEqual(4096);
    expect(embed.fields?.some((f) => f.value.includes('대시보드') || f.value.length > 0)).toBe(
      true,
    );
  });

  it('§6.7 — field value(parameters)가 1024자를 초과하면 코드포인트 단위로 절단한다(Discord field 상한, description과 별개 축)', () => {
    // description(4096)은 넉넉히 상한 아래로 두고, parameters 필드(1024)만 초과시킨다 —
    // 두 상한이 서로 다른 축임을 증명한다(truncateField vs setTruncatedDescription).
    const longValue = '가'.repeat(1100);
    const recommendation: AdminAssistRecommendation = {
      actionId: 'newbie.welcome',
      title: '제목',
      description: '짧은 설명',
      settingsDeepLink: '/settings/guild/guild-1/newbie',
      parameters: [{ key: 'note', label: '메모', value: longValue, isValidated: true }],
    };
    const response = makeResponse({ kind: 'setting', recommendation });

    const embed = buildAdminAssistEmbed(response, context).toJSON();

    const paramField = embed.fields?.find((f) => f.name === '제목');
    expect(paramField).toBeDefined();
    expect(paramField!.value.length).toBeLessThanOrEqual(1024);
    expect(embed.description?.length).toBeLessThanOrEqual(4096);
    expect(embed.description).toBe('짧은 설명'); // description 상한은 건드리지 않았다(축 분리 확인)
  });

  it('T7 — 절단 경계에 이모지(서로게이트 페어)가 걸려도 lone surrogate(�)를 남기지 않는다', () => {
    // 4095개의 'a' + 이모지 1개(코드포인트 1, code unit 2) — code-unit 기준 slice였다면
    // 이모지가 반으로 잘려 lone surrogate가 남는다.
    const text = 'a'.repeat(4095) + '😀' + 'b'.repeat(100);
    const recommendation: AdminAssistRecommendation = {
      actionId: 'newbie.welcome',
      title: '제목',
      description: text,
      settingsDeepLink: '/settings/guild/guild-1/newbie',
      parameters: [],
    };
    const response = makeResponse({ kind: 'setting', recommendation });

    const embed = buildAdminAssistEmbed(response, context).toJSON();

    expect(embed.description).not.toContain('�'); // U+FFFD REPLACEMENT CHARACTER
  });

  // ─── followUpQueries — 일반 텍스트(버튼·칩 없음, D7 (a)) ───────────────────

  it('followUpQueries 는 일반 텍스트 필드로 렌더되고 컴포넌트(버튼)를 만들지 않는다', () => {
    const response = makeResponse({
      resultStatus: 'no_match',
      kind: null,
      fallback: {
        supportedExamples: [],
        generatedGuidance: '안내',
        notices: [],
        suggestedActionId: null,
        suggestedAction: null,
      },
      followUpQueries: ['이런 질문도 해보세요1', '이런 질문도 해보세요2'],
    });

    const embed = buildAdminAssistEmbed(response, context).toJSON();

    expect(embed.fields?.some((f) => f.value.includes('이런 질문도 해보세요1'))).toBe(true);
  });

  // ─── EN 로케일 정상 동작 ────────────────────────────────────────────────

  it('locale="en" 이면 영어 문구로 렌더한다', () => {
    context.locale = 'en';
    const response = makeResponse({ resultStatus: 'llm_error', kind: null });

    const embed = buildAdminAssistEmbed(response, context).toJSON();

    expect(embed.description).toContain('went wrong');
  });

  // ─── #659 리뷰 지적 — Embed 총량(6000자) 초과 방지 ─────────────────────────

  /** Embed 총량 = title+description+모든 field name/value+footer+author 합(Discord 상한) */
  function computeEmbedTotalLength(json: ReturnType<typeof buildEmbedJson>): number {
    return (
      (json.title?.length ?? 0) +
      (json.description?.length ?? 0) +
      (json.fields?.reduce((sum, f) => sum + f.name.length + f.value.length, 0) ?? 0) +
      (json.footer?.text.length ?? 0) +
      (json.author?.name.length ?? 0)
    );
  }

  function buildEmbedJson(response: AdminAssistRecommendResponse) {
    return buildAdminAssistEmbed(response, context).toJSON();
  }

  it('generative + 4000자 초안 + 후속질문 8개(긴 문장)면 부분별 상한은 지키면서도 총량은 6000자를 넘지 않는다', () => {
    const generation: AdminAssistGeneration = {
      title: '공지 초안',
      writeLocale: 'ko',
      parameters: [],
      notices: [],
      action: 'generate.announcementDraft',
      draft: { title: '공지 제목', body: '가'.repeat(4000) },
    };
    const followUpQueries = Array.from(
      { length: 8 },
      (_, i) => `이런 질문도 해보실 수 있어요 — 아주 길게 늘어놓은 후속 질문 예시 문장입니다 ${i}`,
    );
    const response = makeResponse({ kind: 'generative', generation, followUpQueries });

    const json = buildEmbedJson(response);

    expect(computeEmbedTotalLength(json)).toBeLessThanOrEqual(6000);
    // 필수 필드(게시 힌트 + 개요 페이지 링크)는 총량 절단에도 끝까지 보존된다
    expect(json.fields?.some((f) => f.value.includes(WEB_URL))).toBe(true);
  });

  it('총량이 6000자 이내인 입력은 절단 없이 그대로 렌더한다(회귀 방지)', () => {
    const recommendation: AdminAssistRecommendation = {
      actionId: 'newbie.welcome',
      title: '환영 메시지 설정',
      description: '짧은 설명입니다.',
      settingsDeepLink: '/settings/guild/guild-1/newbie',
      parameters: [{ key: 'enabled', label: '활성화', value: true, isValidated: true }],
    };
    const response = makeResponse({
      kind: 'setting',
      recommendation,
      followUpQueries: ['짧은 후속 질문1', '짧은 후속 질문2'],
    });

    const json = buildEmbedJson(response);

    expect(json.description).toBe('짧은 설명입니다.');
    expect(json.fields?.some((f) => f.value.includes('짧은 후속 질문1'))).toBe(true);
    expect(json.fields?.some((f) => f.name === '—')).toBe(false);
  });

  it('description(4096 절단) + parameters(1024) + followups(1024) + link 조합이 총량을 넘으면 후속질문부터 줄이고 링크 필드는 그대로 보존한다', () => {
    // description(5000자→4096 절단+힌트필드) + parameters(1024) + followups(1024) + link 를
    // 각각 상한까지 채우면 6688자로 총량(6000)을 넘는다(부분별 상한만으론 못 막는 조합, #659).
    const recommendation: AdminAssistRecommendation = {
      actionId: 'newbie.welcome',
      title: '가'.repeat(256),
      description: '나'.repeat(5000),
      settingsDeepLink: '/settings/guild/guild-1/newbie',
      parameters: [{ key: 'note', label: '메모', value: '다'.repeat(1200), isValidated: true }],
    };
    const followUpQueries = Array.from(
      { length: 8 },
      (_, i) =>
        `${'아주 길게 늘어놓은 후속 질문 예시 문장을 반복해서 채워넣습니다 '.repeat(5)}${i}`,
    );
    const response = makeResponse({ kind: 'setting', recommendation, followUpQueries });

    // 사전 확인 — 후속질문 원문(절단 전)이 이미 1024자를 넘어 필드 자체 상한(1024)에 걸린다.
    // 즉 description(4096)+parameters(1024)+followups(1024)+link 조합은 부분별 상한을 각각
    // 지켜도 총량(6000)을 넘는다는 전제가 실제로 성립하는지 검증한다(우연히 안 넘는 값 방지).
    const rawFollowUpsLength = followUpQueries.map((q) => `• ${q}`).join('\n').length;
    expect(rawFollowUpsLength).toBeGreaterThan(1024);

    const json = buildEmbedJson(response);

    expect(computeEmbedTotalLength(json)).toBeLessThanOrEqual(6000);

    // 후속질문 필드는 줄어들거나(또는 완전히 제거)됐다 — 보정이 실제로 작동했다는 증거
    const followUpField = json.fields?.find((f) => f.name === '이런 질문도 해보세요');
    if (followUpField) {
      expect(followUpField.value.length).toBeLessThan(1024);
    }

    // 필수 필드(🔗 링크)는 끝까지 보존된다 — 값이 그대로다
    const linkField = json.fields?.find((f) => f.name === '🔗');
    expect(linkField).toBeDefined();
    expect(linkField?.value).toContain(`${WEB_URL}/settings/guild/guild-1/newbie`);

    // parameters 필드도 보존된다(총량 보정 대상이 아님)
    const paramsField = json.fields?.find((f) => f.name === '가'.repeat(256));
    expect(paramsField?.value.length).toBe(1024);
  });

  // ─── F-ADMIN-ASSIST-086(6차 D3 (b)) — 지원 언어 안내 1문장 ───────────────────

  describe('F-ADMIN-ASSIST-086 — isQueryLanguageUnsupported', () => {
    const recommendation: AdminAssistRecommendation = {
      actionId: 'newbie.welcome',
      title: '환영 메시지 설정',
      description: '짧은 설명입니다.',
      settingsDeepLink: '/settings/guild/guild-1/newbie',
      parameters: [],
    };

    function findNoticeField(json: ReturnType<typeof buildEmbedJson>) {
      return json.fields?.find((f) => f.name === '🌐');
    }

    it('true 면 봇 로케일(ko) 안내 1문장 필드를 추가하고 본문은 그대로 둔다', () => {
      const json = buildEmbedJson(
        makeResponse({ kind: 'setting', recommendation, isQueryLanguageUnsupported: true }),
      );

      expect(findNoticeField(json)?.value).toBe(
        '관리 도우미는 현재 한국어와 영어만 지원하니, 한국어나 영어로 물어봐 주세요.',
      );
      expect(json.description).toBe('짧은 설명입니다.');
    });

    it('en 로케일이면 영어 문구로 렌더한다', () => {
      const json = buildAdminAssistEmbed(
        makeResponse({ kind: 'setting', recommendation, isQueryLanguageUnsupported: true }),
        { ...context, locale: 'en' },
      ).toJSON();

      expect(findNoticeField(json)?.value).toContain('only Korean and English');
    });

    it('false·필드 부재(구버전 API)면 안내 필드가 없다', () => {
      const withFalse = buildEmbedJson(
        makeResponse({ kind: 'setting', recommendation, isQueryLanguageUnsupported: false }),
      );
      const withoutField = buildEmbedJson(makeResponse({ kind: 'setting', recommendation }));

      expect(findNoticeField(withFalse)).toBeUndefined();
      expect(findNoticeField(withoutField)).toBeUndefined();
    });

    it('폴백(no_match)·llm_error 분기에도 같은 계약으로 붙는다', () => {
      const fallback: AdminAssistFallback = {
        supportedExamples: ['환영 메시지 켜줘'],
        generatedGuidance: null,
        notices: [],
        suggestedActionId: null,
        suggestedAction: null,
      };
      const noMatch = buildEmbedJson(
        makeResponse({ resultStatus: 'no_match', fallback, isQueryLanguageUnsupported: true }),
      );
      const llmError = buildEmbedJson(
        makeResponse({ resultStatus: 'llm_error', isQueryLanguageUnsupported: true }),
      );

      expect(findNoticeField(noMatch)).toBeDefined();
      expect(findNoticeField(llmError)).toBeDefined();
    });

    it('총량 보정이 일어나도 안내 필드는 보존된다(보정 대상 아님)', () => {
      const longRecommendation: AdminAssistRecommendation = {
        ...recommendation,
        description: '나'.repeat(5000),
        parameters: [{ key: 'note', label: '메모', value: '다'.repeat(1200), isValidated: true }],
      };
      const followUpQueries = Array.from(
        { length: 8 },
        (_, i) =>
          `${'아주 길게 늘어놓은 후속 질문 예시 문장을 반복해서 채워넣습니다 '.repeat(5)}${i}`,
      );

      const json = buildEmbedJson(
        makeResponse({
          kind: 'setting',
          recommendation: longRecommendation,
          followUpQueries,
          isQueryLanguageUnsupported: true,
        }),
      );

      expect(computeEmbedTotalLength(json)).toBeLessThanOrEqual(6000);
      expect(findNoticeField(json)).toBeDefined();
    });
  });

  // ─── F-ADMIN-ASSIST-092(7차 A6 · D2 (b) · EC-AA-387) — no_match 입력 안내 1줄 ────────

  describe('F-ADMIN-ASSIST-092 — no_match 입력 안내(capabilityHint)', () => {
    const fallback: AdminAssistFallback = {
      supportedExamples: ['환영 메시지 켜줘'],
      generatedGuidance: 'I am not sure which feature you need help with.',
      notices: [],
      suggestedActionId: null,
      suggestedAction: null,
    };

    function findHintField(json: ReturnType<typeof buildEmbedJson>) {
      return json.fields?.find((f) => f.name === '💡');
    }

    it('실측 id 112 재현("ji" 한 단어 → no_match) — 입력 안내 필드(웹 capabilityHint 문구 + 예시 1줄)를 붙인다', () => {
      const json = buildEmbedJson(makeResponse({ resultStatus: 'no_match', fallback }));

      expect(findHintField(json)?.value).toBe(
        '한 번에 하나씩만 물어보세요 — 설정 추천, 활동 분석, 공지 초안을 도와드려요. 예: 신입 기간 14일로 설정해줘',
      );
    });

    it('en 로케일이면 영어 안내(웹 capabilityHint 영문과 같은 첫 문장)', () => {
      const json = buildAdminAssistEmbed(makeResponse({ resultStatus: 'no_match', fallback }), {
        ...context,
        locale: 'en',
      }).toJSON();

      expect(findHintField(json)?.value).toContain(
        'Ask one thing at a time — I can recommend settings, analyze activity, or draft announcements.',
      );
    });

    it('success·rejected·llm_error 에는 붙지 않는다(no_match 전용)', () => {
      const recommendation: AdminAssistRecommendation = {
        actionId: 'newbie.welcome',
        title: '환영 메시지 설정',
        description: '설명',
        settingsDeepLink: '/settings/guild/guild-1/newbie',
        parameters: [],
      };
      expect(
        findHintField(buildEmbedJson(makeResponse({ kind: 'setting', recommendation }))),
      ).toBeUndefined();
      expect(
        findHintField(buildEmbedJson(makeResponse({ resultStatus: 'rejected', fallback }))),
      ).toBeUndefined();
      expect(
        findHintField(buildEmbedJson(makeResponse({ resultStatus: 'llm_error' }))),
      ).toBeUndefined();
    });

    it('총량 보정이 일어나도 입력 안내 필드는 보존되고 6000자 상한을 지킨다', () => {
      const followUpQueries = Array.from(
        { length: 8 },
        (_, i) => `${'길게 늘어놓은 후속 질문 예시 문장을 반복해서 채워넣습니다 '.repeat(5)}${i}`,
      );
      const json = buildEmbedJson(
        makeResponse({
          resultStatus: 'no_match',
          fallback: { ...fallback, generatedGuidance: '가'.repeat(5000) },
          followUpQueries,
        }),
      );

      expect(computeEmbedTotalLength(json)).toBeLessThanOrEqual(6000);
      expect(findHintField(json)).toBeDefined();
    });
  });

  // ─── F-ADMIN-ASSIST-087(no_match 리뷰 A3 A+ · EC-AA-383) — "기록됨" 1줄 ──────────────

  describe('F-ADMIN-ASSIST-087 — fallback.isUnsupportedRequestLogged', () => {
    const baseFallback: AdminAssistFallback = {
      supportedExamples: ['환영 메시지 켜줘'],
      generatedGuidance: '채널별 무발화 역할 부여는 아직 없어요.',
      notices: [],
      suggestedActionId: null,
      suggestedAction: null,
    };

    it('true 면 설명문에 "기록해 두었어요" 1줄이 안내문 뒤·예시 목록 앞에 들어간다', () => {
      const json = buildEmbedJson(
        makeResponse({
          resultStatus: 'no_match',
          fallback: { ...baseFallback, isUnsupportedRequestLogged: true },
        }),
      );

      expect(json.description).toBe(
        '채널별 무발화 역할 부여는 아직 없어요.\n\n아직 지원하지 않는 기능 요청으로 기록해 두었어요.\n\n• 환영 메시지 켜줘',
      );
    });

    it('부재·false 면 그 줄이 없다', () => {
      const absent = buildEmbedJson(
        makeResponse({ resultStatus: 'no_match', fallback: baseFallback }),
      );
      const falsy = buildEmbedJson(
        makeResponse({
          resultStatus: 'no_match',
          fallback: { ...baseFallback, isUnsupportedRequestLogged: false },
        }),
      );

      expect(absent.description).not.toContain('기록해 두었어요');
      expect(falsy.description).not.toContain('기록해 두었어요');
    });
  });

  // ─── F-ADMIN-ASSIST-088(7차 A12 · EC-AA-381) — activeChannelCount null ──────────────

  it('F-088 — structureLint activeChannelCount=null(측정 보류)은 0 이 아니라 "—" 로 표시한다', () => {
    const analysis: AdminAssistAnalysis = {
      recipe: 'analytics.structureLint',
      title: '서버 구조 점검',
      parameters: [],
      interpretation: '해석',
      notices: ['activity_data_insufficient'],
      metrics: {
        findings: [],
        summary: { roleCount: 92, channelCount: 59, activeChannelCount: null, roleSyncedAt: null },
      },
    };

    const json = buildEmbedJson(makeResponse({ kind: 'recipe', analysis }));
    const metricField = json.fields?.find((f) => f.name === '서버 구조 점검');

    expect(metricField?.value).toContain('59 channels (— active)');
    expect(metricField?.value).not.toContain('(0 active)');
  });
});

// ─── C-lite 설명 슬롯(F-094) · (b1) 상태 점검(F-095) ───────────────────────────
describe('buildAdminAssistEmbed — C-lite 설명·상태 점검', () => {
  let context: AdminAssistEmbedContext;

  beforeEach(() => {
    const i18n = new BotI18nService();
    i18n.onModuleInit();
    context = { locale: 'ko', i18n, webUrl: WEB_URL, guildId: GUILD_ID };
  });

  const baseRecommendation: AdminAssistRecommendation = {
    actionId: 'level.enable',
    title: '레벨 시스템',
    description:
      '레벨 시스템 기능을 안내해 드릴게요. 이 카드는 안내라서 설정이 바로 바뀌지는 않아요.',
    settingsDeepLink: '/settings/guild/guild-1/level',
    parameters: [{ key: 'isEnabled', label: '레벨 시스템 사용', value: null, isValidated: false }],
  };
  const diagnosis: AdminAssistDiagnosis = {
    domain: 'level',
    outcome: 'evaluated',
    items: [
      { code: 'LV_ENABLED', status: 'ok', text: '레벨 시스템은 켜져 있어요.' },
      { code: 'LV_VOICE_DEDUCTIONS', status: 'check', text: '음성 XP에서 빼는 시간: 혼자 있음.' },
    ],
    selfCheckHint: '본인 XP 는 /미 카드에서 확인할 수 있어요.',
  };

  it('explanation·diagnosis 가 없는 응답은 개정 전과 같은 필드 구성이다(무회귀)', () => {
    const embed = buildAdminAssistEmbed(
      makeResponse({ kind: 'setting', recommendation: baseRecommendation }),
      context,
    ).toJSON();
    // Phase 3 — level.enable 은 웹 승인 대상이라 웹 안내 필드('🖥️') 1개가 추가된다(그 외 구성은 불변).
    expect(embed.fields?.map((f) => f.name)).toEqual(['레벨 시스템', '🖥️', '🔗']);
  });

  it('explanation 이 있으면 설명 필드를 붙이고, 전부 미검증 파라미터 필드는 뺀다 + 가이드 링크(ko 경로)', () => {
    const embed = buildAdminAssistEmbed(
      makeResponse({
        kind: 'setting',
        recommendation: baseRecommendation,
        explanation: {
          body: '설명 본문',
          troubleshooting: ['확인 1', '확인 2'],
          guideSlug: 'newbie',
        },
      }),
      context,
    ).toJSON();
    const names = embed.fields?.map((f) => f.name) ?? [];
    expect(names).not.toContain('레벨 시스템');
    expect(names).toContain('📘 이 기능은');
    expect(embed.fields?.find((f) => f.name === '🧰 작동하지 않을 때 확인할 것')?.value).toBe(
      '• 확인 1\n• 확인 2',
    );
    expect(embed.fields?.find((f) => f.name === '🔗')?.value).toContain(
      `📖 가이드: ${WEB_URL}/guides/newbie`,
    );
  });

  it('en 응답의 가이드 링크는 /en 접두를 붙인다', () => {
    const embed = buildAdminAssistEmbed(
      makeResponse({
        kind: 'setting',
        recommendation: baseRecommendation,
        explanation: { body: 'body', troubleshooting: [], guideSlug: 'ai-report' },
      }),
      { ...context, locale: 'en' },
    ).toJSON();
    expect(embed.fields?.find((f) => f.name === '🔗')?.value).toContain(
      `${WEB_URL}/en/guides/ai-report`,
    );
  });

  it('공개 콘텐츠가 없는 로케일은 en 가이드(/en)로 접는다', () => {
    const embed = buildAdminAssistEmbed(
      makeResponse({
        kind: 'setting',
        recommendation: baseRecommendation,
        explanation: { body: 'body', troubleshooting: [], guideSlug: 'ai-report' },
      }),
      { ...context, locale: 'xx' as unknown as typeof context.locale },
    ).toJSON();
    const value = embed.fields?.find((f) => f.name === '🔗')?.value ?? '';
    expect(value).toContain(`${WEB_URL}/en/guides/ai-report`);
    expect(value).not.toContain('/pt/');
  });

  it('ko 응답은 /pt·/en 접두 없이 무접두 가이드 링크다', () => {
    const embed = buildAdminAssistEmbed(
      makeResponse({
        kind: 'setting',
        recommendation: baseRecommendation,
        explanation: { body: 'body', troubleshooting: [], guideSlug: 'ai-report' },
      }),
      context,
    ).toJSON();
    const value = embed.fields?.find((f) => f.name === '🔗')?.value ?? '';
    expect(value).toContain(`${WEB_URL}/guides/ai-report`);
    expect(value).not.toContain('/pt/');
    expect(value).not.toContain('/en/');
  });

  it('pt 응답의 가이드 링크는 /pt 접두를 붙인다', () => {
    const embed = buildAdminAssistEmbed(
      makeResponse({
        kind: 'setting',
        recommendation: baseRecommendation,
        explanation: { body: 'body', troubleshooting: [], guideSlug: 'ai-report' },
      }),
      { ...context, locale: 'pt' },
    ).toJSON();
    expect(embed.fields?.find((f) => f.name === '🔗')?.value).toContain(
      `${WEB_URL}/pt/guides/ai-report`,
    );
  });

  it('diagnosis 가 있으면 상태 아이콘 + 문장 줄과 본인 확인 안내를 렌더한다(intent 무관 — explanation 없어도)', () => {
    const embed = buildAdminAssistEmbed(
      makeResponse({ kind: 'setting', recommendation: { ...baseRecommendation, diagnosis } }),
      context,
    ).toJSON();
    expect(embed.fields?.find((f) => f.name === '🩺 지금 서버 상태')?.value).toBe(
      '✅ 레벨 시스템은 켜져 있어요.\n🔍 음성 XP에서 빼는 시간: 혼자 있음.\n👤 본인 XP 는 /미 카드에서 확인할 수 있어요.',
    );
  });

  it('unavailable 이면 안내 1줄을 앞에 둔다', () => {
    const embed = buildAdminAssistEmbed(
      makeResponse({
        kind: 'setting',
        recommendation: {
          ...baseRecommendation,
          diagnosis: {
            ...diagnosis,
            outcome: 'unavailable',
            items: [{ code: 'STATIC_CHECK_1', status: 'check', text: '체크 1' }],
            selfCheckHint: null,
          },
        },
      }),
      context,
    ).toJSON();
    expect(embed.fields?.find((f) => f.name === '🩺 지금 서버 상태')?.value).toBe(
      '지금은 상태를 확인하지 못했어요. 아래 항목을 직접 확인해 주세요.\n🔍 체크 1',
    );
  });

  it('최악 길이(설명·진단 최대) 조합도 Embed 총량 6000자 이하다', () => {
    const long = '가'.repeat(2000);
    const embed = buildAdminAssistEmbed(
      makeResponse({
        kind: 'setting',
        recommendation: {
          ...baseRecommendation,
          description: long,
          diagnosis: {
            ...diagnosis,
            items: Array.from({ length: 7 }, (_, i) => ({
              code: `C${i}`,
              status: 'issue' as const,
              text: long,
            })),
          },
        },
        explanation: { body: long, troubleshooting: [long, long], guideSlug: 'newbie' },
        followUpQueries: [long, long],
      }),
      context,
    );
    expect(embedLength(embed.data)).toBeLessThanOrEqual(6000);
  });
});

describe('buildAdminAssistEmbed — Phase 3 웹 승인 안내 1줄(F-ADMIN-ASSIST-109, UC-12)', () => {
  const KO_HINT = '웹 대시보드의 어시스턴트에서 변경 내용을 확인하고 적용할 수 있어요.';
  const EN_HINT = 'You can review and apply this change from the assistant in the web dashboard.';
  let i18n: BotI18nService;

  beforeEach(() => {
    i18n = new BotI18nService();
    i18n.onModuleInit();
  });

  function settingResponse(
    actionId: string,
    overrides: Partial<AdminAssistRecommendResponse> = {},
  ): AdminAssistRecommendResponse {
    return makeResponse({
      kind: 'setting',
      recommendation: {
        actionId,
        title: '제목',
        description: '설명',
        settingsDeepLink: '/settings/guild/guild-1/level',
        parameters: [],
      },
      ...overrides,
    });
  }

  function fieldValues(response: AdminAssistRecommendResponse, locale: 'ko' | 'en'): string[] {
    const embed = buildAdminAssistEmbed(response, {
      locale,
      i18n,
      webUrl: WEB_URL,
      guildId: GUILD_ID,
    }).toJSON();
    return (embed.fields ?? []).map((field) => field.value);
  }

  it.each(['inactive-member.criteria', 'level.enable', 'voice-health.badge'])(
    '%s setting 성공 카드에 한국어 안내 1줄이 붙는다',
    (actionId) => {
      expect(fieldValues(settingResponse(actionId), 'ko')).toContain(KO_HINT);
    },
  );

  it('영어 로케일이면 영어 안내가 붙는다', () => {
    expect(fieldValues(settingResponse('level.enable'), 'en')).toContain(EN_HINT);
  });

  it('웹 승인 대상이 아닌 setting 항목에는 붙지 않는다', () => {
    expect(fieldValues(settingResponse('newbie.welcome'), 'ko')).not.toContain(KO_HINT);
  });

  it('설명 카드(explanation)에는 붙지 않는다 (EC-AA-479 축소)', () => {
    const response = settingResponse('level.enable', {
      explanation: { body: '설명 본문', troubleshooting: [], guideSlug: null },
    });
    expect(fieldValues(response, 'ko')).not.toContain(KO_HINT);
  });

  it('success 가 아니면(rejected 등) 붙지 않는다', () => {
    expect(
      fieldValues(settingResponse('level.enable', { resultStatus: 'rejected' }), 'ko'),
    ).not.toContain(KO_HINT);
  });

  it('분석 레시피 카드에는 붙지 않는다', () => {
    const response = makeResponse({ kind: 'recipe', analysis: null });
    expect(fieldValues(response, 'ko')).not.toContain(KO_HINT);
  });

  it('봇은 실행 요소를 만들지 않는다 — Embed 에 proposal 이 있어도 안내 문구만 렌더한다', () => {
    const response = settingResponse('level.enable');
    const embed = buildAdminAssistEmbed(response, {
      locale: 'ko',
      i18n,
      webUrl: WEB_URL,
      guildId: GUILD_ID,
    }).toJSON();
    expect(JSON.stringify(embed)).not.toContain('previewDigest');
  });
});
