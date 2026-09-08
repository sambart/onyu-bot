/**
 * StickyMessageDeleteCommand 단위 테스트.
 *
 * W7(docs/plans/admin-action-guard-fixes.md §8) — 커맨드는 더 이상 즉시 삭제하지 않는다.
 * `getStickyMessageConfigs`로 대상 채널의 고정메세지 개수를 조회해, 0건이면 기존
 * `stickyDeleteEmpty` 문구로 종료하고, 1건 이상이면 확인/취소 버튼 2개를 게시한다. 실제 삭제는
 * `bot-sticky-delete-confirm.handler.ts`가 담당한다(별도 스펙).
 *
 * i18n 보간 인자 배선 검증은 `best-friend.command.spec.ts` 패턴(BotI18nService 실 로드 + 목
 * 인터랙션) 준용 — i18n 을 목킹하지 않고 실제 로케일 JSON 을 로드해, 기대값도 `i18n.t()` 호출로
 * 산출한다.
 */
import type { BotApiClientService } from '@onyu/bot-api-client';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { STICKY_DELETE_CUSTOM_ID } from '../../event/sticky-message/bot-sticky-delete-confirm.handler';
import { StickyMessageDeleteCommand } from './sticky-message-delete.command';
import { StickyMessageDeleteDto } from './sticky-message-delete.dto';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';
const CHANNEL_ID = 'channel-1';
const OTHER_CHANNEL_ID = 'channel-2';

/** 미치환 `{word}` 리터럴이 남아 있지 않은지 확인하는 회귀 가드. */
const UNSUBSTITUTED_PLACEHOLDER = /\{[a-zA-Z]+\}/;

function makeInteraction(overrides: Record<string, unknown> = {}): ChatInputCommandInteraction {
  return {
    guildId: GUILD_ID,
    locale: 'ko',
    user: { id: USER_ID },
    memberPermissions: { has: vi.fn().mockReturnValue(true) },
    options: { getChannel: vi.fn().mockReturnValue({ id: CHANNEL_ID }) },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ChatInputCommandInteraction;
}

function getEditReplyArg(interaction: ChatInputCommandInteraction): unknown {
  return (interaction.editReply as Mock).mock.calls[0][0];
}

function getEditReplyContent(interaction: ChatInputCommandInteraction): string {
  const arg = getEditReplyArg(interaction);
  return typeof arg === 'string' ? arg : (arg as { content: string }).content;
}

describe('StickyMessageDeleteCommand', () => {
  let command: StickyMessageDeleteCommand;
  let apiClient: { getStickyMessageConfigs: Mock };
  let i18n: BotI18nService;

  beforeEach(() => {
    apiClient = { getStickyMessageConfigs: vi.fn() };

    i18n = new BotI18nService();
    i18n.onModuleInit();
    command = new StickyMessageDeleteCommand(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
    );
  });

  // ─── 권한 없음(:39) ─────────────────────────────────────────────────────────

  it('ManageGuild 권한이 없으면 errors.manageGuildOnly 로 reply 하고 API/deferReply 를 호출하지 않는다', async () => {
    const interaction = makeInteraction({
      memberPermissions: { has: vi.fn().mockReturnValue(false) },
    });

    await command.onDelete(interaction, new StickyMessageDeleteDto());

    expect(interaction.reply).toHaveBeenCalledWith({
      content: i18n.t('ko', 'errors.manageGuildOnly'),
      ephemeral: true,
    });
    expect(apiClient.getStickyMessageConfigs).not.toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  // ─── 길드 밖(:48) — 권한 체크가 먼저이므로 has:true 필요 ──────────────────────

  it('길드 밖(guildId: null)이면 errors.guildOnly 로 reply 하고 API/deferReply 를 호출하지 않는다', async () => {
    const interaction = makeInteraction({ guildId: null });

    await command.onDelete(interaction, new StickyMessageDeleteDto());

    expect(interaction.reply).toHaveBeenCalledWith({
      content: i18n.t('ko', 'errors.guildOnly'),
      ephemeral: true,
    });
    expect(apiClient.getStickyMessageConfigs).not.toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  // ─── 개수 0(:63) — {channelId} 단일 보간, 기존 동작 무변경(W7 R10) ───────────────

  it('대상 채널의 개수가 0이면 {channelId} 가 보간된 stickyDeleteEmpty 로 editReply 하고 확인 버튼을 게시하지 않는다', async () => {
    apiClient.getStickyMessageConfigs.mockResolvedValue({
      ok: true,
      data: [{ channelId: OTHER_CHANNEL_ID, embedTitle: null, enabled: true }],
    });
    const interaction = makeInteraction();

    await command.onDelete(interaction, new StickyMessageDeleteDto());

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const content = getEditReplyContent(interaction);
    expect(content).toBe(i18n.t('ko', 'commands.stickyDeleteEmpty', { channelId: CHANNEL_ID }));
    expect(content).toContain(CHANNEL_ID);
    expect(content).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);
  });

  // ─── 개수 ≥1(W7) — 삭제 미실행 + 확인/취소 버튼 게시 ─────────────────────────

  it('대상 채널의 개수가 1 이상이면 삭제를 실행하지 않고 확인/취소 버튼을 게시한다', async () => {
    apiClient.getStickyMessageConfigs.mockResolvedValue({
      ok: true,
      data: [
        { channelId: CHANNEL_ID, embedTitle: null, enabled: true },
        { channelId: CHANNEL_ID, embedTitle: 'x', enabled: true },
        { channelId: OTHER_CHANNEL_ID, embedTitle: null, enabled: true },
      ],
    });
    const interaction = makeInteraction();

    await command.onDelete(interaction, new StickyMessageDeleteDto());

    const content = getEditReplyContent(interaction);
    expect(content).toBe(
      i18n.t('ko', 'commands.stickyDeleteConfirm', { channelId: CHANNEL_ID, count: 2 }),
    );
    expect(content).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);

    const arg = getEditReplyArg(interaction) as {
      components: { toJSON: () => unknown }[];
    };
    expect(arg.components).toHaveLength(1);

    const row = arg.components[0].toJSON() as {
      components: { custom_id: string; label: string }[];
    };
    const customIds = row.components.map((c) => c.custom_id);
    expect(customIds).toEqual([
      `${STICKY_DELETE_CUSTOM_ID.CONFIRM}${CHANNEL_ID}:${USER_ID}`,
      `${STICKY_DELETE_CUSTOM_ID.CANCEL}${CHANNEL_ID}:${USER_ID}`,
    ]);
  });

  // ─── catch — Error 인스턴스(:76-78) ──────────────────────────────────────────

  it('개수 조회가 Error로 reject되면 error.message가 {message}에 보간된 stickyDeleteError 로 editReply 한다', async () => {
    apiClient.getStickyMessageConfigs.mockRejectedValue(new Error('network fail'));
    const interaction = makeInteraction();

    await command.onDelete(interaction, new StickyMessageDeleteDto());

    const content = getEditReplyContent(interaction);
    expect(content).toBe(i18n.t('ko', 'commands.stickyDeleteError', { message: 'network fail' }));
    expect(content).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);
  });

  // ─── catch — 비-Error throw → unknownError 간접 합성(:78) ────────────────────

  it('개수 조회가 Error가 아닌 값으로 reject되면 errors.unknownError가 {message}에 간접 합성된다', async () => {
    apiClient.getStickyMessageConfigs.mockRejectedValue('raw-string-rejection');
    const interaction = makeInteraction();

    await command.onDelete(interaction, new StickyMessageDeleteDto());

    const content = getEditReplyContent(interaction);
    const expectedMessage = i18n.t('ko', 'errors.unknownError');
    expect(content).toBe(i18n.t('ko', 'commands.stickyDeleteError', { message: expectedMessage }));
    expect(content).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);
  });

  // ─── en 로케일 — 동일 분기 반복(§6-1 케이스 6) ────────────────────────────────

  describe('en 로케일', () => {
    it('개수가 0이면 en 문안으로 렌더되고 한글이 섞이지 않는다', async () => {
      apiClient.getStickyMessageConfigs.mockResolvedValue({ ok: true, data: [] });
      const interaction = makeInteraction({ locale: 'en-US' });

      await command.onDelete(interaction, new StickyMessageDeleteDto());

      const content = getEditReplyContent(interaction);
      expect(content).toBe(i18n.t('en', 'commands.stickyDeleteEmpty', { channelId: CHANNEL_ID }));
      expect(content).not.toMatch(/[가-힣]/);
      expect(content).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);
    });

    it('개수가 1 이상이면 en 문안으로 {channelId}+{count}가 보간되고 한글이 섞이지 않는다', async () => {
      apiClient.getStickyMessageConfigs.mockResolvedValue({
        ok: true,
        data: [{ channelId: CHANNEL_ID, embedTitle: null, enabled: true }],
      });
      const interaction = makeInteraction({ locale: 'en-US' });

      await command.onDelete(interaction, new StickyMessageDeleteDto());

      const content = getEditReplyContent(interaction);
      expect(content).toBe(
        i18n.t('en', 'commands.stickyDeleteConfirm', { channelId: CHANNEL_ID, count: 1 }),
      );
      expect(content).not.toMatch(/[가-힣]/);
      expect(content).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);
    });
  });
});
