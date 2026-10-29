/**
 * 관리도우미 pt interaction — 정적 문구는 en 을 유지한다(docs/plans/i18n-pt-br-bot.md §2-5·§2-6 Q1).
 *
 * 질의 언어 판정·작성 언어 결정이 1군(ko/en) 전용으로 설계돼 있어, 정적 문구만 pt 로 만들면 LLM 해석(en)과
 * 섞인 응답이 된다. 따라서 `commands.adminAssist*` 키는 pt 파일에 없고(`bot-i18n-pt-coverage.spec.ts`),
 * pt interaction 에서도 en 문구로 폴백한다. 공용 `errors.*` 는 표면 밖이 아니므로 pt 로 나온다.
 * 이 spec 은 의도된 동작이다 — 관리도우미 "2군 지원" 트랙이 열리면 의도적으로 갱신한다.
 */
import type { AdminAssistRecommendationResult, BotApiClientService } from '@onyu/bot-api-client';
import type { AdminAssistRecommendResponse } from '@onyu/shared';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { AdminAssistCommand } from './admin-assist.command';
import { AdminAssistCommandDto } from './admin-assist.dto';
import { buildAdminAssistEmbed } from './admin-assist-embed.builder';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';

function makeInteraction(overrides: Record<string, unknown> = {}): ChatInputCommandInteraction {
  return {
    guildId: GUILD_ID,
    locale: 'pt-BR',
    user: { id: USER_ID },
    memberPermissions: { has: vi.fn().mockReturnValue(true) },
    options: { getString: vi.fn().mockReturnValue('Como configuro o canal de boas-vindas?') },
    // 실제 discord.js 처럼 deferReply 호출 후 deferred=true — 오류 안내 경로가 editReply 를 고른다
    deferReply: vi.fn(function (this: { deferred: boolean }) {
      this.deferred = true;
      return Promise.resolve(undefined);
    }),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ChatInputCommandInteraction;
}

const LLM_ERROR_RESPONSE: AdminAssistRecommendResponse = {
  resultStatus: 'llm_error',
  kind: null,
  recommendation: null,
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

describe('AdminAssistCommand — pt-BR interaction (Q1: 정적 문구 en 유지)', () => {
  let command: AdminAssistCommand;
  let i18n: BotI18nService;
  let apiClient: { getAdminAssistRecommendation: Mock };

  beforeEach(() => {
    apiClient = { getAdminAssistRecommendation: vi.fn() };
    i18n = new BotI18nService();
    i18n.onModuleInit();
    command = new AdminAssistCommand(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
    );
  });

  it('i18n 조회: pt 로 adminAssist* 키를 조회하면 en 문구가 나온다(pt 값 없음 → en 폴백)', () => {
    for (const key of [
      'adminAssistError',
      'adminAssistQuotaExhausted',
      'adminAssistCapabilityHint',
    ]) {
      const resolved = i18n.t('pt', `commands.${key}`);

      expect(resolved).toBe(i18n.t('en', `commands.${key}`));
      expect(resolved).not.toBe(`commands.${key}`);
    }
  });

  it('쿼터 소진 안내가 en 문구다', async () => {
    apiClient.getAdminAssistRecommendation.mockResolvedValue({
      ok: false,
      reason: 'quota_exhausted',
    } as AdminAssistRecommendationResult);
    const interaction = makeInteraction();

    await command.onAdminAssist(interaction, new AdminAssistCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: i18n.t('en', 'commands.adminAssistQuotaExhausted'),
    });
  });

  it('API 예외 시 오류 안내가 en 문구다', async () => {
    apiClient.getAdminAssistRecommendation.mockRejectedValue(new Error('network'));
    const interaction = makeInteraction();

    await command.onAdminAssist(interaction, new AdminAssistCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: i18n.t('en', 'commands.adminAssistError'),
    });
  });

  it('llm_error 응답 Embed 의 설명이 en 문구다', () => {
    const embed = buildAdminAssistEmbed(LLM_ERROR_RESPONSE, {
      locale: 'pt',
      i18n,
      webUrl: 'https://onyu.dev',
      guildId: GUILD_ID,
    });

    expect(embed.toJSON().description).toBe(i18n.t('en', 'commands.adminAssistError'));
  });

  it('공용 errors.* (DM·권한 없음)는 표면 밖이 아니므로 pt 로 안내한다', async () => {
    const dm = makeInteraction({ guildId: null });
    const noPermission = makeInteraction({
      memberPermissions: { has: vi.fn().mockReturnValue(false) },
    });

    await command.onAdminAssist(dm, new AdminAssistCommandDto());
    await command.onAdminAssist(noPermission, new AdminAssistCommandDto());

    expect((dm.reply as Mock).mock.calls[0][0]).toEqual({
      content: i18n.t('pt', 'errors.guildOnly'),
      ephemeral: true,
    });
    expect((noPermission.reply as Mock).mock.calls[0][0]).toEqual({
      content: i18n.t('pt', 'errors.manageGuildOnly'),
      ephemeral: true,
    });
    expect(i18n.t('pt', 'errors.guildOnly')).not.toBe(i18n.t('en', 'errors.guildOnly'));
    expect(apiClient.getAdminAssistRecommendation).not.toHaveBeenCalled();
  });
});
