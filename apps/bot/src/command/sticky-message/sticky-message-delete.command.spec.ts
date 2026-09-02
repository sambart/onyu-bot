/**
 * StickyMessageDeleteCommand 단위 테스트 — `/sticky-delete`(`고정메세지삭제`)의 i18n 보간 인자
 * 배선을 검증한다(계획 `docs/plans/i18n-p3-remainders.md` §6 D4 · §6-1, i18n 감사 P3 [S]).
 *
 * `bot-i18n-locale-parity.spec.ts` 가 ko/en 키 존재·플레이스홀더 패리티를 이미 구조적으로
 * 봉인하므로, 이 파일은 그것을 재단언하지 않는다. 이 파일이 메우는 공백은 오직
 * *"커맨드가 그 키를 올바른 인자로 호출하는가"* — `{channelId}`/`{count}`/`{message}` 보간
 * 인자가 실제로 채워지는지다. `best-friend.command.spec.ts` 패턴(BotI18nService 실 로드 +
 * 목 인터랙션) 준용 — i18n 을 목킹하지 않고 실제 로케일 JSON 을 로드해, 기대값도
 * `i18n.t()` 호출로 산출한다(하드코딩 원문 대신 — `bot-role-panel-interaction.handler.spec.ts`
 * 의 더 리팩터링-내성 있는 변형을 따름). 이러면 로케일 문안이 바뀌어도 테스트가 깨지지
 * 않으면서, params 이름 불일치로 인한 리터럴 노출(`{channelId}` 등)은 실제 렌더 문자열
 * 비교로 여전히 잡는다.
 */
import type { BotApiClientService } from '@onyu/bot-api-client';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { StickyMessageDeleteCommand } from './sticky-message-delete.command';
import { StickyMessageDeleteDto } from './sticky-message-delete.dto';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';
const CHANNEL_ID = 'channel-1';

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

function getEditReplyContent(interaction: ChatInputCommandInteraction): string {
  return (interaction.editReply as Mock).mock.calls[0][0] as string;
}

describe('StickyMessageDeleteCommand', () => {
  let command: StickyMessageDeleteCommand;
  let apiClient: { deleteStickyMessageByChannel: Mock };
  let i18n: BotI18nService;

  beforeEach(() => {
    apiClient = { deleteStickyMessageByChannel: vi.fn() };

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
    expect(apiClient.deleteStickyMessageByChannel).not.toHaveBeenCalled();
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
    expect(apiClient.deleteStickyMessageByChannel).not.toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  // ─── deletedCount === 0(:63) — {channelId} 단일 보간 ─────────────────────────

  it('deletedCount가 0이면 {channelId} 가 보간된 stickyDeleteEmpty 로 editReply 한다', async () => {
    apiClient.deleteStickyMessageByChannel.mockResolvedValue({ ok: true, deletedCount: 0 });
    const interaction = makeInteraction();

    await command.onDelete(interaction, new StickyMessageDeleteDto());

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const content = getEditReplyContent(interaction);
    expect(content).toBe(i18n.t('ko', 'commands.stickyDeleteEmpty', { channelId: CHANNEL_ID }));
    expect(content).toContain(CHANNEL_ID);
    expect(content).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);
  });

  // ─── 성공(:70) — {channelId}+{count} 동시 보간 ────────────────────────────────

  it('성공 시 {channelId}와 {count}가 동시에 보간된 stickyDeleteSuccess 로 editReply 한다', async () => {
    apiClient.deleteStickyMessageByChannel.mockResolvedValue({ ok: true, deletedCount: 3 });
    const interaction = makeInteraction();

    await command.onDelete(interaction, new StickyMessageDeleteDto());

    const content = getEditReplyContent(interaction);
    expect(content).toBe(
      i18n.t('ko', 'commands.stickyDeleteSuccess', { channelId: CHANNEL_ID, count: 3 }),
    );
    expect(content).toContain(CHANNEL_ID);
    expect(content).toContain('3');
    expect(content).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);
    expect(content).not.toBe('commands.stickyDeleteSuccess'); // 키 폴백 노출 없음
  });

  // ─── catch — Error 인스턴스(:76-78) ──────────────────────────────────────────

  it('API 호출이 Error로 reject되면 error.message가 {message}에 보간된 stickyDeleteError 로 editReply 한다', async () => {
    apiClient.deleteStickyMessageByChannel.mockRejectedValue(new Error('network fail'));
    const interaction = makeInteraction();

    await command.onDelete(interaction, new StickyMessageDeleteDto());

    const content = getEditReplyContent(interaction);
    expect(content).toBe(i18n.t('ko', 'commands.stickyDeleteError', { message: 'network fail' }));
    expect(content).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);
  });

  // ─── catch — 비-Error throw → unknownError 간접 합성(:78) ────────────────────

  it('API 호출이 Error가 아닌 값으로 reject되면 errors.unknownError가 {message}에 간접 합성된다', async () => {
    apiClient.deleteStickyMessageByChannel.mockRejectedValue('raw-string-rejection');
    const interaction = makeInteraction();

    await command.onDelete(interaction, new StickyMessageDeleteDto());

    const content = getEditReplyContent(interaction);
    const expectedMessage = i18n.t('ko', 'errors.unknownError');
    expect(content).toBe(i18n.t('ko', 'commands.stickyDeleteError', { message: expectedMessage }));
    expect(content).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);
  });

  // ─── en 로케일 — 동일 분기 반복(§6-1 케이스 6) ────────────────────────────────

  describe('en 로케일', () => {
    it('deletedCount가 0이면 en 문안으로 렌더되고 한글이 섞이지 않는다', async () => {
      apiClient.deleteStickyMessageByChannel.mockResolvedValue({ ok: true, deletedCount: 0 });
      const interaction = makeInteraction({ locale: 'en-US' });

      await command.onDelete(interaction, new StickyMessageDeleteDto());

      const content = getEditReplyContent(interaction);
      expect(content).toBe(i18n.t('en', 'commands.stickyDeleteEmpty', { channelId: CHANNEL_ID }));
      expect(content).not.toMatch(/[가-힣]/);
      expect(content).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);
    });

    it('성공 시 en 문안으로 {channelId}+{count}가 보간되고 한글이 섞이지 않는다', async () => {
      apiClient.deleteStickyMessageByChannel.mockResolvedValue({ ok: true, deletedCount: 3 });
      const interaction = makeInteraction({ locale: 'en-US' });

      await command.onDelete(interaction, new StickyMessageDeleteDto());

      const content = getEditReplyContent(interaction);
      expect(content).toBe(
        i18n.t('en', 'commands.stickyDeleteSuccess', { channelId: CHANNEL_ID, count: 3 }),
      );
      expect(content).not.toMatch(/[가-힣]/);
      expect(content).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);
    });
  });
});
