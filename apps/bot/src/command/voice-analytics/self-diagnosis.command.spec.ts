/**
 * SelfDiagnosisCommand 단위 테스트 — verdict 카테고리 계약 검증.
 * API(@onyu/shared VOICE_HEALTH_VERDICT_CATEGORY)가 생성하는 카테고리 문자열과
 * 봇이 결과를 매칭(find)하는 카테고리 문자열이 동일 상수 소스를 사용함을 보장한다(B2 재발 방지).
 * 봇이 하드코딩 리터럴로 회귀하면, 주입한 4개 verdict 중 일부가 embed에서 누락되어 테스트가 실패한다.
 */
import type { BotApiClientService, SelfDiagnosisResultData } from '@onyu/bot-api-client';
import { VERDICT_CATEGORY_CODE, VOICE_HEALTH_VERDICT_CATEGORY } from '@onyu/shared';
import type { CommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { SelfDiagnosisCommand } from './self-diagnosis.command';

function makeInteraction(overrides: Record<string, unknown> = {}): CommandInteraction {
  return {
    guildId: 'guild-1',
    user: { id: 'user-1' },
    locale: 'ko',
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as CommandInteraction;
}

function makeResultData(overrides: Partial<SelfDiagnosisResultData> = {}): SelfDiagnosisResultData {
  return {
    totalMinutes: 600,
    activeDays: 5,
    totalDays: 7,
    activeDaysRatio: 0.71,
    avgDailyMinutes: 85,
    activityRank: 3,
    activityTotalUsers: 20,
    activityTopPercent: 15,
    peerCount: 4,
    hhiScore: 0.3,
    topPeers: [],
    hasMocoActivity: false,
    mocoScore: 0,
    mocoRank: 0,
    mocoTotalUsers: 0,
    mocoTopPercent: 0,
    mocoHelpedNewbies: 0,
    micUsageRate: 0.5,
    aloneRatio: 0.1,
    // 구조값(categoryCode/criterionCode/actualValue 등) 경로 검증(R4) — categoryCode 부재 시
    // matchVerdict가 한국어 category 폴백으로 통과하나, 본 mock은 구조 경로를 명시적으로 검증한다.
    // 각 항목의 raw criterion/actual(폴백 필드)은 구조 렌더(ko) 결과와 문자 단위 동일하도록 맞춰져
    // 있다(ko 동작 불변 검증 목적).
    verdicts: [
      {
        category: VOICE_HEALTH_VERDICT_CATEGORY.ACTIVITY,
        categoryCode: VERDICT_CATEGORY_CODE.ACTIVITY,
        isPassed: true,
        criterion: '300분 이상',
        actual: '600분',
        actualValue: 600,
        actualUnit: 'MINUTES',
        criterionCode: 'VERDICT_CRIT_MIN_ACTIVITY_MINUTES',
        criterionParams: { minutes: 300 },
      },
      {
        category: VOICE_HEALTH_VERDICT_CATEGORY.ACTIVE_DAYS,
        categoryCode: VERDICT_CATEGORY_CODE.ACTIVE_DAYS,
        isPassed: true,
        criterion: '활동일 비율 50% 이상',
        actual: '71%',
        actualValue: 71,
        actualUnit: 'PERCENT',
        criterionCode: 'VERDICT_CRIT_MIN_ACTIVE_DAYS_RATIO',
        criterionParams: { percent: 50 },
      },
      {
        category: VOICE_HEALTH_VERDICT_CATEGORY.RELATIONSHIP_DIVERSITY,
        categoryCode: VERDICT_CATEGORY_CODE.RELATIONSHIP_DIVERSITY,
        isPassed: true,
        criterion: '70점 이상',
        actual: '70점',
        actualValue: 70,
        actualUnit: 'POINT',
        criterionCode: 'VERDICT_CRIT_MIN_DIVERSITY_POINTS',
        criterionParams: { points: 70 },
      },
      {
        category: VOICE_HEALTH_VERDICT_CATEGORY.PEER_COUNT,
        categoryCode: VERDICT_CATEGORY_CODE.PEER_COUNT,
        isPassed: false,
        criterion: '5명 이상',
        actual: '4명',
        actualValue: 4,
        actualUnit: 'PERSON',
        criterionCode: 'VERDICT_CRIT_MIN_PEER_COUNT',
        criterionParams: { count: 5 },
      },
    ],
    badges: [],
    badgeGuides: [],
    ...overrides,
  };
}

describe('SelfDiagnosisCommand', () => {
  let command: SelfDiagnosisCommand;
  let apiClient: { runSelfDiagnosis: Mock; getSelfDiagnosisLlmSummary: Mock };

  beforeEach(() => {
    apiClient = {
      runSelfDiagnosis: vi.fn(),
      getSelfDiagnosisLlmSummary: vi.fn().mockResolvedValue({ ok: true, data: null }),
    };
    const i18n = new BotI18nService();
    i18n.onModuleInit();
    command = new SelfDiagnosisCommand(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService(),
    );
  });

  it('shared 상수의 4개 verdict 카테고리가 모두 embed description에 노출된다', async () => {
    const result = makeResultData();
    apiClient.runSelfDiagnosis.mockResolvedValue({
      ok: true,
      data: { result, analysisDays: 7, isCooldownEnabled: true, cooldownHours: 24 },
    });

    const interaction = makeInteraction();
    await command.onSelfDiagnosis(interaction);

    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    const callArg = (interaction.editReply as Mock).mock.calls[0][0] as {
      embeds: Array<{ data: { description?: string } }>;
    };
    const description = callArg.embeds[0].data.description ?? '';

    // 4개 verdict 모두 (기준: ...) 라인으로 노출되어야 한다 — 카테고리 리터럴 불일치 시 find()가
    // undefined를 반환하여 해당 라인이 누락된다.
    expect(description).toContain(`(기준: ${result.verdicts[0].criterion})`);
    expect(description).toContain(`(기준: ${result.verdicts[1].criterion})`);
    expect(description).toContain(`(기준: ${result.verdicts[2].criterion})`);
    expect(description).toContain(`(기준: ${result.verdicts[3].criterion})`);
  });

  it('verdicts 배열이 비어도 예외 없이 embed를 생성한다', async () => {
    const result = makeResultData({ verdicts: [] });
    apiClient.runSelfDiagnosis.mockResolvedValue({
      ok: true,
      data: { result, analysisDays: 7, isCooldownEnabled: false, cooldownHours: 0 },
    });

    const interaction = makeInteraction();
    await command.onSelfDiagnosis(interaction);

    expect(interaction.editReply).toHaveBeenCalledTimes(1);
  });

  // ──────────────────────────────────────────────────────
  // 가드 — 길드 밖 사용 (locale별 분기)
  // ──────────────────────────────────────────────────────
  describe('가드 — 길드 밖에서 사용', () => {
    it('ko 로케일이면 한국어 안내로 reply하고 API를 호출하지 않는다', async () => {
      const interaction = makeInteraction({ guildId: null, locale: 'ko' });

      await command.onSelfDiagnosis(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: '서버에서만 사용 가능한 명령어입니다.',
        ephemeral: true,
      });
      expect(apiClient.runSelfDiagnosis).not.toHaveBeenCalled();
    });

    it('en-US 로케일이면 영어 안내로 reply한다', async () => {
      const interaction = makeInteraction({ guildId: null, locale: 'en-US' });

      await command.onSelfDiagnosis(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    });

    it('미지원 로케일(ja)이면 en 폴백 안내로 reply한다', async () => {
      const interaction = makeInteraction({ guildId: null, locale: 'ja' });

      await command.onSelfDiagnosis(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // en 로케일 embed 출력 — 이번 i18n 이관의 핵심 목적(비한국어 클라이언트 영어 응답) 검증
  // ──────────────────────────────────────────────────────
  describe('en-US 로케일 embed 출력', () => {
    it('verdict 라인이 영어 포맷(threshold)으로 노출되고 섹션 헤더가 영어로 번역된다', async () => {
      const result = makeResultData();
      apiClient.runSelfDiagnosis.mockResolvedValue({
        ok: true,
        data: { result, analysisDays: 7, isCooldownEnabled: true, cooldownHours: 24 },
      });

      const interaction = makeInteraction({ locale: 'en-US' });
      await command.onSelfDiagnosis(interaction);

      const callArg = (interaction.editReply as Mock).mock.calls[0][0] as {
        embeds: Array<{ data: { title?: string; description?: string } }>;
      };
      const embedData = callArg.embeds[0].data;
      const description = embedData.description ?? '';

      expect(embedData.title).toBe('🩺 Voice Activity Self-Diagnosis');
      // 구조 경로(criterionCode/criterionParams)로 렌더된 영어 문구 — 원문(ko) criterion이 아니다
      expect(description).toContain('(threshold: 300 min or more)');
      expect(description).toContain('**📊 Activity**');
      expect(description).toContain('**🤝 Relationship Diversity**');
      // ko 문자열(예: "(기준: ...)")이 잔존하지 않아야 한다 — 혼재 회귀 방지
      expect(description).not.toContain('기준:');
    });

    it('미지원 로케일(ja)이면 en 폴백으로 동일하게 영어 embed가 노출된다', async () => {
      const result = makeResultData();
      apiClient.runSelfDiagnosis.mockResolvedValue({
        ok: true,
        data: { result, analysisDays: 7, isCooldownEnabled: true, cooldownHours: 24 },
      });

      const interaction = makeInteraction({ locale: 'ja' });
      await command.onSelfDiagnosis(interaction);

      const callArg = (interaction.editReply as Mock).mock.calls[0][0] as {
        embeds: Array<{ data: { title?: string; description?: string } }>;
      };
      const embedData = callArg.embeds[0].data;

      expect(embedData.title).toBe('🩺 Voice Activity Self-Diagnosis');
      expect(embedData.description ?? '').toContain('(threshold: 300 min or more)');
    });
  });

  // ──────────────────────────────────────────────────────
  // 구 API 폴백 매트릭스 (R4 Plan B §5) — API가 신규 구조 필드
  // (categoryCode/actualValue/actualUnit/criterionCode/criterionParams,
  //  criterionCode/criterionParams/currentCode/currentParams) 를 전혀 내려주지 않는
  // 구버전 응답 시나리오. 봇은 category/actual/criterion, name/criterion/current
  // 원문 문자열로 폴백 렌더해야 한다(H-3.3/H-6, 원문 노출 없이 동작 불변).
  // ──────────────────────────────────────────────────────
  describe('구 API 폴백 매트릭스 — 구조 필드 부재 시 동작', () => {
    it('verdict에 구조 필드가 전혀 없으면 category(한국어) 폴백 매칭 + criterion/actual 원문으로 렌더된다', async () => {
      const legacyVerdicts = [
        {
          category: VOICE_HEALTH_VERDICT_CATEGORY.ACTIVITY,
          isPassed: true,
          criterion: '레거시-기준-활동',
          actual: '레거시-실적-활동',
        },
        {
          category: VOICE_HEALTH_VERDICT_CATEGORY.ACTIVE_DAYS,
          isPassed: true,
          criterion: '레거시-기준-일수',
          actual: '레거시-실적-일수',
        },
        {
          category: VOICE_HEALTH_VERDICT_CATEGORY.RELATIONSHIP_DIVERSITY,
          isPassed: true,
          criterion: '레거시-기준-다양성',
          actual: '레거시-실적-다양성',
        },
        {
          category: VOICE_HEALTH_VERDICT_CATEGORY.PEER_COUNT,
          isPassed: false,
          criterion: '레거시-기준-교류',
          actual: '레거시-실적-교류',
        },
      ] as SelfDiagnosisResultData['verdicts'];
      const result = makeResultData({ verdicts: legacyVerdicts, badgeGuides: [] });
      apiClient.runSelfDiagnosis.mockResolvedValue({
        ok: true,
        data: { result, analysisDays: 7, isCooldownEnabled: true, cooldownHours: 24 },
      });

      const interaction = makeInteraction();
      await command.onSelfDiagnosis(interaction);

      const callArg = (interaction.editReply as Mock).mock.calls[0][0] as {
        embeds: Array<{ data: { description?: string } }>;
      };
      const description = callArg.embeds[0].data.description ?? '';

      // categoryCode 부재 → category(한국어) 폴백 매칭이 성공해 4개 라인 모두 노출되어야 한다.
      expect(description).toContain('활동량: 레거시-실적-활동 (기준: 레거시-기준-활동)');
      expect(description).toContain('레거시-실적-일수 (기준: 레거시-기준-일수)');
      expect(description).toContain('레거시-실적-다양성 (기준: 레거시-기준-다양성)');
      expect(description).toContain('레거시-실적-교류 (기준: 레거시-기준-교류)');
    });

    it('뱃지에 criterionCode/currentCode가 없으면 criterion/current 원문으로 렌더된다 (unearned)', async () => {
      const legacyBadge = {
        code: 'HUNTER',
        name: '헌터',
        icon: '🎯',
        isEarned: false,
        criterion: '레거시-뱃지-기준',
        current: '레거시-뱃지-현재',
      } as SelfDiagnosisResultData['badgeGuides'][number];
      const result = makeResultData({ verdicts: [], badgeGuides: [legacyBadge] });
      apiClient.runSelfDiagnosis.mockResolvedValue({
        ok: true,
        data: { result, analysisDays: 7, isCooldownEnabled: true, cooldownHours: 24 },
      });

      const interaction = makeInteraction();
      await command.onSelfDiagnosis(interaction);

      const callArg = (interaction.editReply as Mock).mock.calls[0][0] as {
        embeds: Array<{ data: { description?: string } }>;
      };
      const description = callArg.embeds[0].data.description ?? '';

      expect(description).toContain('레거시-뱃지-기준');
      expect(description).toContain('레거시-뱃지-현재');
    });

    it('code 자체가 없는 result(구 API 봉투)도 예외 없이 embed를 생성한다', async () => {
      const result = makeResultData({ verdicts: [], badgeGuides: [] });
      apiClient.runSelfDiagnosis.mockResolvedValue({
        ok: true,
        data: { result, analysisDays: 7, isCooldownEnabled: false, cooldownHours: 0 },
      });

      const interaction = makeInteraction();
      await command.onSelfDiagnosis(interaction);

      expect(interaction.editReply).toHaveBeenCalledTimes(1);
    });
  });
});

// ──────────────────────────────────────────────────────
// VOICE_HEALTH_VERDICT_CATEGORY 값 계약 (B2 회귀 방지)
// 위 embed 노출 테스트는 상수를 "참조"로 사용하므로, 상수 자체의 실제 문자열 값이
// (예: 공백 유무) 변질되어도 두 쪽이 여전히 일치하면 감지하지 못한다. 정본 문자열
// 값 자체를 명시적으로 스냅샷 검증해 재발(예: '활동 일수' → '활동일수' 회귀)을 방지한다.
// ──────────────────────────────────────────────────────
describe('VOICE_HEALTH_VERDICT_CATEGORY — 값 계약(B2)', () => {
  it('4개 카테고리 값이 API 정본 문자열과 정확히 일치한다(공백 포함)', () => {
    expect(VOICE_HEALTH_VERDICT_CATEGORY).toEqual({
      ACTIVITY: '활동량',
      ACTIVE_DAYS: '활동 일수',
      RELATIONSHIP_DIVERSITY: '관계 다양성',
      PEER_COUNT: '교류 인원',
    });
  });
});
