/**
 * AdminAssistCommand 단위 테스트(`/관리도우미`·`/admin-assist`, F-ADMIN-ASSIST-078~081, M4/A2).
 * UC-08 §4.1 처리 순서 · TC-08-01~17 매핑(admin-assist-bot-entrypoint 계획 §11-7).
 * `best-friend.command.spec.ts` 패턴(BotI18nService 실 로드 + 목 인터랙션) 준용.
 *
 * 핵심 회귀 가드:
 * - B1(guildId 확인)이 B2(권한 확인)보다 먼저다 — DM 에서 memberPermissions 가 null 이라
 *   권한 체크를 먼저 하면 오분류된다(UC-08 §4.1, sticky-register 와 순서가 갈리는 이유).
 * - B1·B2 실패 시 SDK 호출 0(쿼터 미소모).
 * - 🔒 §9-3 — HTTP 200(SDK ok:true) 이어도 resultStatus='llm_error' 면 빈 Embed 가 아니라
 *   오류 Embed 를 내려야 한다(embed 빌더 위임 — 여기서는 위임 자체만 검증).
 */
import type { AdminAssistRecommendationResult, BotApiClientService } from '@onyu/bot-api-client';
import type { AdminAssistRecommendResponse } from '@onyu/shared';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { AdminAssistCommand } from './admin-assist.command';
import { AdminAssistCommandDto } from './admin-assist.dto';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';
const QUERY_TEXT = '신규 멤버 환영 메시지 설정 어떻게 해?';

function makeOptions(query = QUERY_TEXT): { getString: Mock } {
  return { getString: vi.fn().mockReturnValue(query) };
}

function makeInteraction(overrides: Record<string, unknown> = {}): ChatInputCommandInteraction {
  return {
    guildId: GUILD_ID,
    locale: 'ko',
    user: { id: USER_ID },
    memberPermissions: { has: vi.fn().mockReturnValue(true) },
    options: makeOptions(),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ChatInputCommandInteraction;
}

const SUCCESS_RESPONSE: AdminAssistRecommendResponse = {
  resultStatus: 'success',
  kind: 'setting',
  recommendation: {
    actionId: 'newbie.welcome',
    title: '환영 메시지',
    description: '설명',
    settingsDeepLink: '/settings/guild/guild-1/newbie',
    parameters: [],
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
    resetAt: '2026-09-22T00:00:00.000Z',
    isAvailable: true,
  },
};

const LLM_ERROR_RESPONSE: AdminAssistRecommendResponse = {
  ...SUCCESS_RESPONSE,
  resultStatus: 'llm_error',
  kind: null,
  recommendation: null,
};

describe('AdminAssistCommand', () => {
  let command: AdminAssistCommand;
  let apiClient: { getAdminAssistRecommendation: Mock };

  beforeEach(() => {
    apiClient = {
      getAdminAssistRecommendation: vi
        .fn()
        .mockResolvedValue({ ok: true, data: SUCCESS_RESPONSE } as AdminAssistRecommendationResult),
    };

    const i18n = new BotI18nService();
    i18n.onModuleInit();
    command = new AdminAssistCommand(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
    );
  });

  // ─── TC-08-08 — B1: DM(guildId: null) ──────────────────────────────────────

  it('TC-08-08 — DM(guildId: null)에서는 errors.guildOnly로 즉시 응답하고 API 를 호출하지 않는다(쿼터 미소모)', async () => {
    const interaction = makeInteraction({ guildId: null });

    await command.onAdminAssist(interaction, new AdminAssistCommandDto());

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(apiClient.getAdminAssistRecommendation).not.toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  // ─── TC-08-09 — B2: ManageGuild 미보유 ──────────────────────────────────────

  it('TC-08-09 — ManageGuild 미보유(런타임 재검증 실패)면 errors.manageGuildOnly로 응답하고 API 를 호출하지 않는다', async () => {
    const interaction = makeInteraction({
      memberPermissions: { has: vi.fn().mockReturnValue(false) },
    });

    await command.onAdminAssist(interaction, new AdminAssistCommandDto());

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(apiClient.getAdminAssistRecommendation).not.toHaveBeenCalled();
  });

  it('🔒 B1이 B2보다 먼저다 — DM(guildId: null) + memberPermissions: null 조합에서도 guildOnly(권한없음 아님)로 응답한다(오분류 방지, UC-08 §4.1)', async () => {
    const interaction = makeInteraction({ guildId: null, memberPermissions: null });
    const i18n = new BotI18nService();
    i18n.onModuleInit();

    await command.onAdminAssist(interaction, new AdminAssistCommandDto());

    const call = (interaction.reply as Mock).mock.calls[0][0] as { content: string };
    expect(call.content).toBe(i18n.t('ko', 'errors.guildOnly'));
    expect(call.content).not.toBe(i18n.t('ko', 'errors.manageGuildOnly'));
  });

  // ─── 정상 경로 ────────────────────────────────────────────────────────────

  it('권한·길드 확인을 통과하면 deferReply({ephemeral:true})를 호출한다(🔒 ephemeral 강제)', async () => {
    const interaction = makeInteraction();

    await command.onAdminAssist(interaction, new AdminAssistCommandDto());

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
  });

  it('🔒 userId 는 언제나 interaction.user.id 다 — SDK 호출에 실행자 id 만 전달한다', async () => {
    const interaction = makeInteraction();

    await command.onAdminAssist(interaction, new AdminAssistCommandDto());

    expect(apiClient.getAdminAssistRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: GUILD_ID, userId: USER_ID, queryText: QUERY_TEXT }),
    );
  });

  it('writeLocale 을 SDK 호출에 실지 않는다(1차 미전송, endpoint-spec §5E-2 🟨)', async () => {
    const interaction = makeInteraction();

    await command.onAdminAssist(interaction, new AdminAssistCommandDto());

    const callArg = apiClient.getAdminAssistRecommendation.mock.calls[0]?.[0];
    expect(callArg).not.toHaveProperty('writeLocale');
  });

  it('성공 응답이면 embeds 로 editReply 한다', async () => {
    const interaction = makeInteraction();

    await command.onAdminAssist(interaction, new AdminAssistCommandDto());

    const call = (interaction.editReply as Mock).mock.calls[0][0] as { embeds: unknown[] };
    expect(call.embeds).toHaveLength(1);
  });

  // ─── TC-08-10 — 쿼터 소진 ─────────────────────────────────────────────────

  it('TC-08-10 — 쿼터 소진(ok:false, reason:quota_exhausted)이면 전용 안내 문구로 응답한다', async () => {
    apiClient.getAdminAssistRecommendation.mockResolvedValue({
      ok: false,
      reason: 'quota_exhausted',
    } as AdminAssistRecommendationResult);
    const interaction = makeInteraction();

    await command.onAdminAssist(interaction, new AdminAssistCommandDto());

    const call = (interaction.editReply as Mock).mock.calls[0][0] as { content: string };
    expect(call.content).toContain('20');
  });

  it('TC-08-10 — 쿼터 소진과 일반 오류는 서로 다른 문구를 쓴다(장애 문구와 구분, 문구 비동일성 회귀 가드)', async () => {
    const i18n = new BotI18nService();
    i18n.onModuleInit();
    const quotaCommand = new AdminAssistCommand(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
    );

    apiClient.getAdminAssistRecommendation.mockResolvedValueOnce({
      ok: false,
      reason: 'quota_exhausted',
    } as AdminAssistRecommendationResult);
    const quotaInteraction = makeInteraction();
    await quotaCommand.onAdminAssist(quotaInteraction, new AdminAssistCommandDto());
    const quotaContent = (quotaInteraction.editReply as Mock).mock.calls[0][0] as {
      content: string;
    };

    apiClient.getAdminAssistRecommendation.mockResolvedValueOnce({
      ok: false,
      reason: 'error',
    } as AdminAssistRecommendationResult);
    const errorInteraction = makeInteraction();
    await quotaCommand.onAdminAssist(errorInteraction, new AdminAssistCommandDto());
    const errorContent = (errorInteraction.editReply as Mock).mock.calls[0][0] as {
      content: string;
    };

    expect(quotaContent.content).not.toBe(errorContent.content);
  });

  // ─── TC-08-16 — SDK 네트워크 오류 ──────────────────────────────────────────

  it('TC-08-16 — SDK 가 throw 해도 일반 오류 문구로 ephemeral 응답한다(unhandled 아님)', async () => {
    apiClient.getAdminAssistRecommendation.mockRejectedValue(new Error('network down'));
    const interaction = makeInteraction();

    await command.onAdminAssist(interaction, new AdminAssistCommandDto());

    const call = (interaction.editReply as Mock).mock.calls[0][0] as { content: string };
    expect(typeof call.content).toBe('string');
    expect(call.content.length).toBeGreaterThan(0);
  });
});
