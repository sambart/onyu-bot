/**
 * BotRolePanelInteractionHandler 단위 테스트 (F-ROLE-PANEL-010, 2026-08-01 신규).
 *
 * 커버 케이스:
 * - localeTag가 있으면 응답 언어가 인터랙션 초입에 resolve한 로케일을 덮어쓴다
 * - 성공 계열 + localeTag 존재 → setUserLocale best-effort 호출(실패해도 응답은 성공 유지)
 * - 실패 계열(NOT_FOUND/NO_PERMISSION/UNKNOWN_ROLE/LOCKED) → setUserLocale 미호출
 * - localeTag가 null인 버튼(기존 GRANT/TOGGLE 패널) → setUserLocale 미호출
 * - 상태→i18n 매핑: swapped/alreadySelected
 */
import type { BotApiClientService } from '@onyu/bot-api-client';
import { buildRolePanelCustomId } from '@onyu/shared';
import type { GuildMember, Interaction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import type { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { BotRolePanelInteractionHandler } from './bot-role-panel-interaction.handler';
import type {
  RolePanelInteractionResult,
  RolePanelInteractionService,
} from './bot-role-panel-interaction.service';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';
const PANEL_ID = 1;
const BUTTON_ID = 10;

function makeMember(): GuildMember {
  return {} as GuildMember;
}

function makeInteraction(overrides: Record<string, unknown> = {}): Interaction {
  const member = makeMember();
  return {
    isButton: () => true,
    customId: buildRolePanelCustomId(PANEL_ID, BUTTON_ID),
    user: { id: USER_ID },
    guildId: GUILD_ID,
    guild: {
      members: {
        cache: { get: vi.fn().mockReturnValue(member) },
        fetch: vi.fn().mockResolvedValue(member),
      },
    },
    locale: 'en-US', // interaction.locale — resolvedLocale이 이걸 en으로 매핑
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    replied: false,
    deferred: false,
    ...overrides,
  } as unknown as Interaction;
}

function makeResult(
  overrides: Partial<RolePanelInteractionResult> = {},
): RolePanelInteractionResult {
  return { status: 'GRANTED', localeTag: null, ...overrides };
}

describe('BotRolePanelInteractionHandler', () => {
  let handler: BotRolePanelInteractionHandler;
  let interactionService: { handle: Mock };
  let localeResolver: { resolve: Mock };
  let botApiClient: { setUserLocale: Mock };
  let i18n: BotI18nService;

  beforeEach(() => {
    interactionService = { handle: vi.fn() };
    localeResolver = { resolve: vi.fn().mockResolvedValue('en') };
    botApiClient = { setUserLocale: vi.fn().mockResolvedValue({ locale: 'ko' }) };

    i18n = new BotI18nService();
    i18n.onModuleInit();

    handler = new BotRolePanelInteractionHandler(
      interactionService as unknown as RolePanelInteractionService,
      i18n,
      localeResolver as unknown as LocaleResolverService,
      botApiClient as unknown as BotApiClientService,
    );
  });

  // ──────────────────────────────────────────────────────
  // localeTag 응답 언어 오버라이드 (F-ROLE-PANEL-010 3항)
  // ──────────────────────────────────────────────────────
  describe('응답 언어 결정', () => {
    it('result.localeTag가 있으면 resolve된 로케일을 덮어쓴다 — resolvedLocale=en, localeTag=ko → 한국어로 렌더', async () => {
      localeResolver.resolve.mockResolvedValue('en');
      interactionService.handle.mockResolvedValue(
        makeResult({ status: 'GRANTED', localeTag: 'ko' }),
      );
      const interaction = makeInteraction();

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: i18n.t('ko', 'role-panel.granted'),
      });
    });

    it('result.localeTag가 null이면 resolve된 로케일을 그대로 사용한다', async () => {
      localeResolver.resolve.mockResolvedValue('en');
      interactionService.handle.mockResolvedValue(
        makeResult({ status: 'GRANTED', localeTag: null }),
      );
      const interaction = makeInteraction();

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: i18n.t('en', 'role-panel.granted'),
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // locale best-effort 저장 — 성공 계열만 호출
  // ──────────────────────────────────────────────────────
  describe('setUserLocale best-effort 호출 조건', () => {
    it.each<RolePanelInteractionResult['status']>([
      'GRANTED',
      'REMOVED',
      'SWAPPED',
      'ALREADY_HAS',
      'ALREADY_SELECTED',
    ])('성공 계열(%s) + localeTag 존재 → setUserLocale 1회 호출', async (status) => {
      interactionService.handle.mockResolvedValue(makeResult({ status, localeTag: 'ko' }));
      const interaction = makeInteraction();

      await handler.handle(interaction);

      expect(botApiClient.setUserLocale).toHaveBeenCalledTimes(1);
      expect(botApiClient.setUserLocale).toHaveBeenCalledWith(USER_ID, 'ko');
    });

    it.each<RolePanelInteractionResult['status']>([
      'NOT_FOUND',
      'NO_PERMISSION',
      'UNKNOWN_ROLE',
      'LOCKED',
    ])('실패 계열(%s) + localeTag 존재 → setUserLocale 미호출', async (status) => {
      interactionService.handle.mockResolvedValue(makeResult({ status, localeTag: 'ko' }));
      const interaction = makeInteraction();

      await handler.handle(interaction);

      expect(botApiClient.setUserLocale).not.toHaveBeenCalled();
    });

    it('localeTag가 null인 버튼(기존 GRANT/TOGGLE 패널) → 성공 계열이어도 setUserLocale 미호출', async () => {
      interactionService.handle.mockResolvedValue(
        makeResult({ status: 'GRANTED', localeTag: null }),
      );
      const interaction = makeInteraction();

      await handler.handle(interaction);

      expect(botApiClient.setUserLocale).not.toHaveBeenCalled();
    });

    it('F-03: setUserLocale이 실패해도(throw) Ephemeral 응답은 성공 상태로 유지된다(best-effort 흡수)', async () => {
      interactionService.handle.mockResolvedValue(
        makeResult({ status: 'GRANTED', localeTag: 'ko' }),
      );
      botApiClient.setUserLocale.mockRejectedValue(new Error('bot-api timeout'));
      const interaction = makeInteraction();

      await expect(handler.handle(interaction)).resolves.toBeUndefined();

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: i18n.t('ko', 'role-panel.granted'),
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // 상태 → i18n 매핑 (신규 상태값)
  // ──────────────────────────────────────────────────────
  describe('상태 → i18n 메시지 매핑', () => {
    it('SWAPPED → role-panel.swapped 메시지', async () => {
      interactionService.handle.mockResolvedValue(
        makeResult({ status: 'SWAPPED', localeTag: 'en' }),
      );
      const interaction = makeInteraction();

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: i18n.t('en', 'role-panel.swapped'),
      });
    });

    it('ALREADY_SELECTED → role-panel.alreadySelected 메시지', async () => {
      interactionService.handle.mockResolvedValue(
        makeResult({ status: 'ALREADY_SELECTED', localeTag: 'ko' }),
      );
      const interaction = makeInteraction();

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: i18n.t('ko', 'role-panel.alreadySelected'),
      });
    });
  });
});
