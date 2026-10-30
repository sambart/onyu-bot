import type { Logger } from '@nestjs/common';
import type { BotApiClientService } from '@onyu/bot-api-client';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../common/application/bot-i18n.service';
import { buildBadgesReply, handleBadgesView } from './me-badges-card';

const GUILD_ID = 'guild-1';

function makeInteraction(): ChatInputCommandInteraction {
  return {
    guildId: GUILD_ID,
    user: { id: 'user-1', displayName: 'Alice', displayAvatarURL: () => 'https://cdn/a.png' },
    member: { displayName: 'Alice' } as unknown as GuildMember,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    deleteReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction;
}

const OK_RESPONSE = { ok: true, data: { imageBase64: Buffer.from('png').toString('base64') } };

describe('me-badges-card', () => {
  let i18n: BotI18nService;
  let apiClient: { getBadgeCollectionCard: Mock };
  let logger: { warn: Mock; error: Mock };

  function run(interaction: ChatInputCommandInteraction): Promise<void> {
    return handleBadgesView({
      interaction,
      apiClient: apiClient as unknown as BotApiClientService,
      i18n,
      locale: 'ko',
      logger: logger as unknown as Logger,
    });
  }

  beforeEach(() => {
    i18n = new BotI18nService();
    i18n.onModuleInit();
    apiClient = { getBadgeCollectionCard: vi.fn().mockResolvedValue(OK_RESPONSE) };
    logger = { warn: vi.fn(), error: vi.fn() };
  });

  it('buildBadgesReply — ok 면 badges.png 첨부 1개, ok:false 면 null', () => {
    const reply = buildBadgesReply({ ok: true, data: { imageBase64: 'cG5n' } });
    expect(reply?.files).toHaveLength(1);
    expect(reply?.files[0].name).toBe('badges.png');
    expect(buildBadgesReply({ ok: false, data: null })).toBeNull();
  });

  it('T-C7 — 성공 시 공개 deferReply(인자 없음) + badges.png editReply, 버튼 없음', async () => {
    const interaction = makeInteraction();

    await run(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(apiClient.getBadgeCollectionCard).toHaveBeenCalledWith({
      guildId: GUILD_ID,
      userId: 'user-1',
      displayName: 'Alice',
      avatarUrl: 'https://cdn/a.png',
      locale: 'ko',
    });
    const payload = (interaction.editReply as Mock).mock.calls[0][0] as {
      files: Array<{ name: string }>;
      components?: unknown;
    };
    expect(payload.files[0].name).toBe('badges.png');
    expect(payload.components).toBeUndefined();
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('T-C8 — ok:false 면 defer 응답 삭제 후 ephemeral meBadgesError 안내', async () => {
    apiClient.getBadgeCollectionCard.mockResolvedValue({ ok: false, data: null });
    const interaction = makeInteraction();

    await run(interaction);

    expect(interaction.deleteReply).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: i18n.t('ko', 'commands.meBadgesError'),
      ephemeral: true,
    });
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('T-C8 — API 예외도 동일하게 ephemeral 안내 + logger.error', async () => {
    apiClient.getBadgeCollectionCard.mockRejectedValue(new Error('boom'));
    const interaction = makeInteraction();

    await run(interaction);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true, content: i18n.t('ko', 'commands.meBadgesError') }),
    );
  });

  it('T-C8 — deleteReply 실패는 warn 후 followUp 을 계속한다', async () => {
    apiClient.getBadgeCollectionCard.mockResolvedValue({ ok: false, data: null });
    const interaction = makeInteraction();
    (interaction.deleteReply as Mock).mockRejectedValue(new Error('gone'));

    await run(interaction);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).toHaveBeenCalledTimes(1);
  });

  it('T-C10 — meBadgesError 가 4로케일 모두 존재하고 키 원문이 아니다', () => {
    for (const locale of ['ko', 'en', 'pt', 'ja']) {
      const text = i18n.t(locale, 'commands.meBadgesError');
      expect(text).not.toBe('commands.meBadgesError');
      expect(text.length).toBeGreaterThan(0);
    }
  });
});
