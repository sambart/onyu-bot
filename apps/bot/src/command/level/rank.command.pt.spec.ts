/**
 * RankCommand pt 응답 — pt-BR interaction 이 pt 문구를 받는지 고정한다(i18n-pt-br-bot, F-GENERAL-007).
 * 문구 값은 봇 JSON 에서 `i18n.t('pt', key)` 로 읽어 비교하고, en/ko 문구와 달라야 한다는 것을 함께 단언한다
 * (번역 개정에 흔들리지 않으면서 "pt 로 해석되지 않고 en 으로 폴백" 하는 회귀를 잡는다).
 */
import type { BotApiClientService } from '@onyu/bot-api-client';
import type { ChatInputCommandInteraction, GuildMember, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { RankCommand } from './rank.command';
import { RankCommandDto } from './rank.dto';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';
const DISCORD_PT_BR = 'pt-BR';

function makeTarget(overrides: Record<string, unknown>): User {
  return {
    id: 'peer-1',
    bot: false,
    displayName: 'peer',
    displayAvatarURL: () => 'https://cdn/peer.png',
    ...overrides,
  } as unknown as User;
}

function makeInteraction(overrides: Record<string, unknown> = {}): ChatInputCommandInteraction {
  return {
    guildId: GUILD_ID,
    locale: DISCORD_PT_BR,
    user: { id: USER_ID, displayName: 'Alice', displayAvatarURL: () => 'https://cdn/a.png' },
    member: { displayName: 'Alice' } as unknown as GuildMember,
    options: {
      getUser: vi.fn().mockReturnValue(null),
      getMember: vi.fn().mockReturnValue(null),
      getInteger: vi.fn().mockReturnValue(null),
    },
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

describe('RankCommand — pt-BR interaction', () => {
  let command: RankCommand;
  let i18n: BotI18nService;
  let apiClient: { getLevelRankCard: Mock; getMeProfile: Mock };

  beforeEach(() => {
    apiClient = { getLevelRankCard: vi.fn(), getMeProfile: vi.fn() };
    i18n = new BotI18nService();
    i18n.onModuleInit();
    command = new RankCommand(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
    );
  });

  function expectPtOnly(content: string, key: string): void {
    const pt = i18n.t('pt', key);

    expect(content).toBe(pt);
    expect(pt).not.toBe(key);
    expect(pt).not.toBe(i18n.t('en', key));
    expect(pt).not.toBe(i18n.t('ko', key));
  }

  it('길드 밖(DM)이면 errors.guildOnly 를 pt 로 안내한다', async () => {
    const interaction = makeInteraction({ guildId: null });

    await command.onRank(interaction, new RankCommandDto());

    const call = (interaction.reply as Mock).mock.calls[0][0] as {
      content: string;
      ephemeral: boolean;
    };
    expectPtOnly(call.content, 'errors.guildOnly');
    expect(call.ephemeral).toBe(true);
  });

  it('대상이 봇이면 commands.rankBotTarget 을 pt 로 안내하고 API 를 호출하지 않는다', async () => {
    const interaction = makeInteraction({
      options: {
        getUser: vi.fn().mockReturnValue(makeTarget({ id: 'bot-1', bot: true })),
        getMember: vi.fn().mockReturnValue({}),
        getInteger: vi.fn().mockReturnValue(null),
      },
    });

    await command.onRank(interaction, new RankCommandDto());

    const call = (interaction.reply as Mock).mock.calls[0][0] as { content: string };
    expectPtOnly(call.content, 'commands.rankBotTarget');
    expect(apiClient.getLevelRankCard).not.toHaveBeenCalled();
    expect(apiClient.getMeProfile).not.toHaveBeenCalled();
  });

  it('대상이 비멤버이면 commands.rankNonMember 를 pt 로 안내한다', async () => {
    const interaction = makeInteraction({
      options: {
        getUser: vi.fn().mockReturnValue(makeTarget({})),
        getMember: vi.fn().mockReturnValue(null),
        getInteger: vi.fn().mockReturnValue(null),
      },
    });

    await command.onRank(interaction, new RankCommandDto());

    const call = (interaction.reply as Mock).mock.calls[0][0] as { content: string };
    expectPtOnly(call.content, 'commands.rankNonMember');
  });

  it('본인 조회 API 가 예외를 던지면 commands.rankError 를 pt 로 안내한다', async () => {
    apiClient.getMeProfile.mockRejectedValue(new Error('API 500'));
    const interaction = makeInteraction();

    await command.onRank(interaction, new RankCommandDto());

    const call = (interaction.editReply as Mock).mock.calls[0][0] as { content: string };
    expectPtOnly(call.content, 'commands.rankError');
  });

  it('본인 조회 시 카드 API 에 locale pt 를 전달한다', async () => {
    apiClient.getMeProfile.mockResolvedValue({
      ok: true,
      days: 15,
      data: { imageBase64: Buffer.from('png').toString('base64') },
    });
    const interaction = makeInteraction();

    await command.onRank(interaction, new RankCommandDto());

    expect(apiClient.getMeProfile).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: GUILD_ID, userId: USER_ID, locale: 'pt' }),
    );
  });
});
