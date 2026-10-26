/**
 * MeCommand pt 응답 — pt-BR interaction 이 pt 로 해석돼 카드 API 에 `pt` 가 전달되고,
 * 버튼 라벨·안내 문구가 pt 인지 고정한다(i18n-pt-br-bot, F-GENERAL-007 요구 8).
 */
import type { BotApiClientService, MeProfileResponse } from '@onyu/bot-api-client';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../common/application/bot-i18n.service';
import { LocaleResolverService } from '../common/application/locale-resolver.service';
import { MeCommand } from './me.command';
import { MeCommandDto } from './me.dto';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';

function makeInteraction(overrides: Record<string, unknown> = {}): ChatInputCommandInteraction {
  return {
    guildId: GUILD_ID,
    locale: 'pt-BR',
    user: { id: USER_ID, displayName: 'Alice', displayAvatarURL: () => 'https://cdn/avatar.png' },
    member: { displayName: 'Alice' } as unknown as GuildMember,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ChatInputCommandInteraction;
}

function profileResponse(overrides: Partial<MeProfileResponse> = {}): MeProfileResponse {
  return {
    ok: true,
    days: 15,
    data: { imageBase64: Buffer.from('png').toString('base64') },
    ...overrides,
  };
}

interface ReplyPayload {
  content?: string;
  components: Array<{ components: Array<{ toJSON: () => Record<string, unknown> }> }>;
}

describe('MeCommand — pt-BR interaction', () => {
  let command: MeCommand;
  let i18n: BotI18nService;
  let apiClient: { getMeProfile: Mock };
  let getUserLocale: Mock;

  beforeEach(() => {
    apiClient = { getMeProfile: vi.fn().mockResolvedValue(profileResponse()) };
    getUserLocale = vi.fn().mockResolvedValue({ locale: null });
    i18n = new BotI18nService();
    i18n.onModuleInit();
    command = new MeCommand(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService({ getUserLocale } as unknown as BotApiClientService),
    );
  });

  it('저장 로케일이 없으면 interaction pt-BR 이 pt 로 해석돼 getMeProfile 에 locale pt 가 전달된다', async () => {
    await command.onMe(makeInteraction(), new MeCommandDto());

    expect(apiClient.getMeProfile).toHaveBeenCalledWith(expect.objectContaining({ locale: 'pt' }));
  });

  it('저장 로케일 ko 는 interaction pt-BR 보다 우선한다(F-GENERAL-005)', async () => {
    getUserLocale.mockResolvedValue({ locale: 'ko' });

    await command.onMe(makeInteraction(), new MeCommandDto());

    expect(apiClient.getMeProfile).toHaveBeenCalledWith(expect.objectContaining({ locale: 'ko' }));
  });

  it('버튼 3종의 라벨이 pt 문구이고 en/ko 라벨과 다르다', async () => {
    const interaction = makeInteraction();

    await command.onMe(interaction, new MeCommandDto());

    const call = (interaction.editReply as Mock).mock.calls[0][0] as ReplyPayload;
    const buttons = call.components[0].components.map((b) => b.toJSON());
    const keys = ['meButtonLabel', 'meButtonLeaderboard', 'meButtonActivityDetail'];

    expect(buttons.map((b) => b.label)).toEqual(keys.map((k) => i18n.t('pt', `commands.${k}`)));
    for (const key of keys) {
      const pt = i18n.t('pt', `commands.${key}`);
      expect(pt).not.toBe(i18n.t('en', `commands.${key}`));
      expect(pt).not.toBe(i18n.t('ko', `commands.${key}`));
    }
  });

  it('활동 데이터가 없으면 안내 문구를 pt 로 응답한다(미치환 {days} 없음)', async () => {
    apiClient.getMeProfile.mockResolvedValue(profileResponse({ data: null, days: 15 }));
    const interaction = makeInteraction();

    await command.onMe(interaction, new MeCommandDto());

    const call = (interaction.editReply as Mock).mock.calls[0][0] as ReplyPayload;
    expect(call.content).toBe(i18n.t('pt', 'commands.meNoActivity', { days: 15 }));
    expect(call.content).not.toBe(i18n.t('en', 'commands.meNoActivity', { days: 15 }));
    expect(call.content).toContain('15');
    expect(call.content).not.toMatch(/\{\w+\}/);
  });
});
