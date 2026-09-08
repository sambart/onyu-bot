/**
 * BotStickyDeleteConfirmHandler 단위 테스트 (docs/plans/admin-action-guard-fixes.md W7, §10.5 #59~62).
 */
import type { BotApiClientService } from '@onyu/bot-api-client';
import type { ButtonInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import {
  BotStickyDeleteConfirmHandler,
  STICKY_DELETE_CUSTOM_ID,
} from './bot-sticky-delete-confirm.handler';

const CLICKER_USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const CHANNEL_ID = 'channel-1';
const GUILD_ID = 'guild-1';

function makeMemberPermissions(hasManageGuild: boolean) {
  return { has: vi.fn().mockReturnValue(hasManageGuild) };
}

function makeButtonInteraction(overrides: Record<string, unknown> = {}): ButtonInteraction {
  return {
    isButton: () => true,
    customId: `${STICKY_DELETE_CUSTOM_ID.CONFIRM}${CHANNEL_ID}:${CLICKER_USER_ID}`,
    user: { id: CLICKER_USER_ID },
    guildId: GUILD_ID,
    locale: 'ko',
    memberPermissions: makeMemberPermissions(true),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    replied: false,
    deferred: false,
    ...overrides,
  } as unknown as ButtonInteraction;
}

describe('BotStickyDeleteConfirmHandler', () => {
  let handler: BotStickyDeleteConfirmHandler;
  let apiClient: { deleteStickyMessageByChannel: Mock };

  beforeEach(() => {
    apiClient = {
      deleteStickyMessageByChannel: vi.fn().mockResolvedValue({ ok: true, deletedCount: 1 }),
    };

    const i18n = new BotI18nService();
    i18n.onModuleInit();
    handler = new BotStickyDeleteConfirmHandler(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
    );
  });

  it('sticky_delete: 접두사가 아닌 버튼은 무시한다', async () => {
    const interaction = makeButtonInteraction({ customId: 'other_feature:button:1' });

    await handler.handle(interaction);

    expect(apiClient.deleteStickyMessageByChannel).not.toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('#59: 클릭한 유저가 customId 의 userId 와 다르면 삭제하지 않고 거부한다', async () => {
    const interaction = makeButtonInteraction({
      user: { id: OTHER_USER_ID },
    });

    await handler.handle(interaction);

    expect(apiClient.deleteStickyMessageByChannel).not.toHaveBeenCalled();
    expect(interaction.deferUpdate).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it('#62: ManageGuild 권한이 없으면(사이 회수) 거부하고 삭제를 실행하지 않는다', async () => {
    const interaction = makeButtonInteraction({
      memberPermissions: makeMemberPermissions(false),
    });

    await handler.handle(interaction);

    expect(apiClient.deleteStickyMessageByChannel).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it('#60: 취소 버튼은 삭제를 호출하지 않고 취소 안내로 update 하며 버튼을 제거한다', async () => {
    const interaction = makeButtonInteraction({
      customId: `${STICKY_DELETE_CUSTOM_ID.CANCEL}${CHANNEL_ID}:${CLICKER_USER_ID}`,
    });

    await handler.handle(interaction);

    expect(apiClient.deleteStickyMessageByChannel).not.toHaveBeenCalled();
    expect(interaction.update).toHaveBeenCalledWith(expect.objectContaining({ components: [] }));
  });

  it('#61: 확인 버튼은 interaction.guildId(신뢰 소스)로 삭제를 호출한다(customId 의 guildId 아님)', async () => {
    const interaction = makeButtonInteraction();

    await handler.handle(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(apiClient.deleteStickyMessageByChannel).toHaveBeenCalledWith(GUILD_ID, CHANNEL_ID);
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ components: [] }));
  });

  it('삭제 개수 0(중복 클릭 등) 이면 empty 문구로 안내한다(별도 락 없이 멱등)', async () => {
    apiClient.deleteStickyMessageByChannel.mockResolvedValue({ ok: true, deletedCount: 0 });
    const interaction = makeButtonInteraction();

    await handler.handle(interaction);

    const call = (interaction.editReply as Mock).mock.calls[0][0] as { content: string };
    expect(call.content).not.toContain('undefined');
  });

  it('DM 컨텍스트(guildId 없음)면 아무 처리도 하지 않는다', async () => {
    const interaction = makeButtonInteraction({ guildId: null });

    await handler.handle(interaction);

    expect(apiClient.deleteStickyMessageByChannel).not.toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('customId 형식이 불량하면(파싱 실패) 잘못된 요청 안내로 거부한다', async () => {
    const interaction = makeButtonInteraction({
      customId: `${STICKY_DELETE_CUSTOM_ID.CONFIRM}only-one-part`,
    });

    await handler.handle(interaction);

    expect(apiClient.deleteStickyMessageByChannel).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it('삭제 중 예외가 발생하면 에러 문구로 editReply 한다', async () => {
    apiClient.deleteStickyMessageByChannel.mockRejectedValue(new Error('boom'));
    const interaction = makeButtonInteraction();

    await handler.handle(interaction);

    const call = (interaction.editReply as Mock).mock.calls[0][0] as {
      content: string;
      components: unknown[];
    };
    expect(call.components).toEqual([]);
  });
});
