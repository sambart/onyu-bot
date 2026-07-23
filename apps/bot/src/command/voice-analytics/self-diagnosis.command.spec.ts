/**
 * SelfDiagnosisCommand 단위 테스트 — verdict 카테고리 계약 검증.
 * API(@onyu/shared VOICE_HEALTH_VERDICT_CATEGORY)가 생성하는 카테고리 문자열과
 * 봇이 결과를 매칭(find)하는 카테고리 문자열이 동일 상수 소스를 사용함을 보장한다(B2 재발 방지).
 * 봇이 하드코딩 리터럴로 회귀하면, 주입한 4개 verdict 중 일부가 embed에서 누락되어 테스트가 실패한다.
 */
import type { BotApiClientService, SelfDiagnosisResultData } from '@onyu/bot-api-client';
import { VOICE_HEALTH_VERDICT_CATEGORY } from '@onyu/shared';
import type { CommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { SelfDiagnosisCommand } from './self-diagnosis.command';

function makeInteraction(overrides: Record<string, unknown> = {}): CommandInteraction {
  return {
    guildId: 'guild-1',
    user: { id: 'user-1' },
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
    verdicts: [
      {
        category: VOICE_HEALTH_VERDICT_CATEGORY.ACTIVITY,
        isPassed: true,
        criterion: '300분 이상',
        actual: '600분',
      },
      {
        category: VOICE_HEALTH_VERDICT_CATEGORY.ACTIVE_DAYS,
        isPassed: true,
        criterion: '50% 이상',
        actual: '71%',
      },
      {
        category: VOICE_HEALTH_VERDICT_CATEGORY.RELATIONSHIP_DIVERSITY,
        isPassed: true,
        criterion: '70점 이상',
        actual: '70점',
      },
      {
        category: VOICE_HEALTH_VERDICT_CATEGORY.PEER_COUNT,
        isPassed: false,
        criterion: '5명 이상',
        actual: '4명',
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
    command = new SelfDiagnosisCommand(apiClient as unknown as BotApiClientService);
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
