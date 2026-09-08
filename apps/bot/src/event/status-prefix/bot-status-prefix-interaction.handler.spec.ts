/**
 * BotStatusPrefixInteractionHandler 단위 테스트 (신규 — F-USAGE-041 AUTO-ACTION 계측 도입 계기 작성).
 * 최소 커버리지: setNickname 성공 시 apply/reset 각 1회 계측, no_permission/other_error 시 0회.
 */
import type { BotApiClientService } from '@onyu/bot-api-client';
import { type ButtonInteraction, DiscordAPIError, type GuildMember } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { BotI18nService } from '../../common/application/bot-i18n.service';
import type { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { BotStatusPrefixInteractionHandler } from './bot-status-prefix-interaction.handler';

/** Discord REST API 에러 코드 — Missing Permissions */
const DISCORD_ERR_MISSING_PERMISSIONS = 50013;

function makeMember(setNickname: Mock): GuildMember {
  return { setNickname, displayName: 'nick' } as unknown as GuildMember;
}

function makeInteraction(overrides: Record<string, unknown> = {}): ButtonInteraction {
  return {
    isButton: () => true,
    customId: 'status_prefix:1',
    guildId: 'guild-1',
    user: { id: 'member-1' },
    member: makeMember(vi.fn().mockResolvedValue(undefined)),
    locale: 'ko',
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    deferred: true,
    replied: false,
    ...overrides,
  } as unknown as ButtonInteraction;
}

function makeDiscordAPIError(code: number): DiscordAPIError {
  const err = new Error('Discord API Error') as DiscordAPIError;
  Object.setPrototypeOf(err, DiscordAPIError.prototype);
  (err as unknown as { code: number }).code = code;
  return err;
}

describe('BotStatusPrefixInteractionHandler', () => {
  let handler: BotStatusPrefixInteractionHandler;
  let apiClient: {
    applyStatusPrefix: Mock;
    resetStatusPrefix: Mock;
    recordAutoAction: Mock;
  };
  let i18n: { t: Mock };
  let localeResolver: { resolve: Mock };

  beforeEach(() => {
    apiClient = {
      applyStatusPrefix: vi.fn(),
      // rollbackApply()의 기본 폴백 — handleApply 실패 경로(no_permission/other_error) 테스트가
      // 개별적으로 재정의하지 않아도 rollbackApply 내부 .catch() 호출이 안전하게 동작한다.
      resetStatusPrefix: vi.fn().mockResolvedValue({ success: true }),
      recordAutoAction: vi.fn().mockResolvedValue(undefined),
    };
    i18n = { t: vi.fn((_locale: string, key: string) => key) };
    localeResolver = { resolve: vi.fn().mockResolvedValue('ko') };

    handler = new BotStatusPrefixInteractionHandler(
      apiClient as unknown as BotApiClientService,
      i18n as unknown as BotI18nService,
      localeResolver as unknown as LocaleResolverService,
    );
  });

  describe('handleApply', () => {
    it('setNickname 성공 시 status-prefix/apply 1회 계측한다', async () => {
      apiClient.applyStatusPrefix.mockResolvedValue({
        success: true,
        newNickname: '[뉴닉]nick',
        message: 'ok',
      });
      const setNickname = vi.fn().mockResolvedValue(undefined);
      const interaction = makeInteraction({
        customId: 'status_prefix:1',
        member: makeMember(setNickname),
      });

      await handler.handle(interaction);

      expect(apiClient.recordAutoAction).toHaveBeenCalledTimes(1);
      expect(apiClient.recordAutoAction).toHaveBeenCalledWith({
        guildId: 'guild-1',
        domain: 'status-prefix',
        action: 'apply',
      });
    });

    it('setNickname이 50013(no_permission)로 실패하면 계측하지 않는다', async () => {
      apiClient.applyStatusPrefix.mockResolvedValue({
        success: true,
        newNickname: '[뉴닉]nick',
        message: 'ok',
      });
      apiClient.resetStatusPrefix.mockResolvedValue({ success: true });
      const setNickname = vi
        .fn()
        .mockRejectedValue(makeDiscordAPIError(DISCORD_ERR_MISSING_PERMISSIONS));
      const interaction = makeInteraction({
        customId: 'status_prefix:1',
        member: makeMember(setNickname),
      });

      await handler.handle(interaction);

      expect(apiClient.recordAutoAction).not.toHaveBeenCalled();
    });

    it('setNickname이 그 외 오류(other_error)로 실패하면 계측하지 않는다', async () => {
      apiClient.applyStatusPrefix.mockResolvedValue({
        success: true,
        newNickname: '[뉴닉]nick',
        message: 'ok',
      });
      const setNickname = vi.fn().mockRejectedValue(new Error('network error'));
      const interaction = makeInteraction({
        customId: 'status_prefix:1',
        member: makeMember(setNickname),
      });

      await handler.handle(interaction);

      expect(apiClient.recordAutoAction).not.toHaveBeenCalled();
    });

    it('API success=false(닉네임 변경 불필요)이면 계측하지 않는다', async () => {
      apiClient.applyStatusPrefix.mockResolvedValue({ success: false, message: 'fail' });
      const setNickname = vi.fn();
      const interaction = makeInteraction({
        customId: 'status_prefix:1',
        member: makeMember(setNickname),
      });

      await handler.handle(interaction);

      expect(setNickname).not.toHaveBeenCalled();
      expect(apiClient.recordAutoAction).not.toHaveBeenCalled();
    });
  });

  describe('handleReset', () => {
    it('setNickname 성공 시 status-prefix/reset 1회 계측한다', async () => {
      apiClient.resetStatusPrefix.mockResolvedValue({
        success: true,
        originalNickname: 'nick',
        message: 'ok',
      });
      const setNickname = vi.fn().mockResolvedValue(undefined);
      const interaction = makeInteraction({
        customId: 'status_reset:1',
        member: makeMember(setNickname),
      });

      await handler.handle(interaction);

      expect(apiClient.recordAutoAction).toHaveBeenCalledTimes(1);
      expect(apiClient.recordAutoAction).toHaveBeenCalledWith({
        guildId: 'guild-1',
        domain: 'status-prefix',
        action: 'reset',
      });
    });

    it('setNickname이 no_permission으로 실패하면 계측하지 않는다', async () => {
      apiClient.resetStatusPrefix.mockResolvedValue({
        success: true,
        originalNickname: 'nick',
        message: 'ok',
      });
      const setNickname = vi
        .fn()
        .mockRejectedValue(makeDiscordAPIError(DISCORD_ERR_MISSING_PERMISSIONS));
      const interaction = makeInteraction({
        customId: 'status_reset:1',
        member: makeMember(setNickname),
      });

      await handler.handle(interaction);

      expect(apiClient.recordAutoAction).not.toHaveBeenCalled();
    });

    it('setNickname이 other_error로 실패하면 계측하지 않는다', async () => {
      apiClient.resetStatusPrefix.mockResolvedValue({
        success: true,
        originalNickname: 'nick',
        message: 'ok',
      });
      const setNickname = vi.fn().mockRejectedValue(new Error('network error'));
      const interaction = makeInteraction({
        customId: 'status_reset:1',
        member: makeMember(setNickname),
      });

      await handler.handle(interaction);

      expect(apiClient.recordAutoAction).not.toHaveBeenCalled();
    });
  });

  it('recordAutoAction이 reject해도 interaction 응답은 정상 완료된다', async () => {
    apiClient.applyStatusPrefix.mockResolvedValue({
      success: true,
      newNickname: '[뉴닉]nick',
      message: 'ok',
    });
    apiClient.recordAutoAction.mockRejectedValue(new Error('bot-api down'));
    const setNickname = vi.fn().mockResolvedValue(undefined);
    const interaction = makeInteraction({
      customId: 'status_prefix:1',
      member: makeMember(setNickname),
    });

    await expect(handler.handle(interaction)).resolves.toBeUndefined();
    expect(interaction.editReply as Mock).toHaveBeenCalled();
  });
});
