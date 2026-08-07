/**
 * HelpCommand 단위 테스트 — `/help`(`/도움말`)의 관리자 링크 조건부 노출 + 폴백 배선을 검증한다(F-GENERAL-006, UF-GENERAL-004).
 * `me.command.spec.ts` 패턴(BotI18nService 실 로드 + 목 인터랙션) 준용.
 */
import type { BotApiClientService } from '@onyu/bot-api-client';
import type { CommandInteraction, EmbedBuilder } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../common/application/bot-i18n.service';
import { LocaleResolverService } from '../common/application/locale-resolver.service';
import { HelpCommand } from './help.command';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';
const originalWebUrl = process.env['WEB_URL'];

function makeInteraction(overrides: Record<string, unknown> = {}): CommandInteraction {
  return {
    guildId: GUILD_ID,
    locale: 'ko',
    user: { id: USER_ID },
    memberPermissions: { has: vi.fn().mockReturnValue(false) },
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as CommandInteraction;
}

function getReplyDescription(interaction: CommandInteraction): string {
  const call = (interaction.reply as Mock).mock.calls[0][0] as { embeds: EmbedBuilder[] };
  return (call.embeds[0].toJSON() as { description?: string }).description ?? '';
}

describe('HelpCommand', () => {
  let command: HelpCommand;

  beforeEach(() => {
    const i18n = new BotI18nService();
    i18n.onModuleInit();
    command = new HelpCommand(
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
    );
  });

  afterEach(() => {
    if (originalWebUrl === undefined) {
      delete process.env['WEB_URL'];
    } else {
      process.env['WEB_URL'] = originalWebUrl;
    }
  });

  it('관리자 + 길드 문맥에서는 시작 가이드 링크를 포함한다', async () => {
    const interaction = makeInteraction({
      memberPermissions: { has: vi.fn().mockReturnValue(true) },
    });

    await command.onHelp(interaction);

    expect(getReplyDescription(interaction)).toContain(
      `/dashboard/guild/${GUILD_ID}/getting-started`,
    );
  });

  it('일반 멤버 + 길드 문맥에서는 시작 가이드 링크를 미포함하되 대시보드 링크는 포함한다', async () => {
    const interaction = makeInteraction();

    await command.onHelp(interaction);

    const description = getReplyDescription(interaction);
    expect(description).not.toContain('getting-started');
    expect(description).toContain('/select-guild');
  });

  it('DM(guildId: null)에서도 관리자 링크 없이 정상 응답한다(errors.guildOnly로 종료하지 않음)', async () => {
    const interaction = makeInteraction({ guildId: null });

    await command.onHelp(interaction);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    expect(getReplyDescription(interaction)).not.toContain('getting-started');
  });

  it('ephemeral: true 로 응답한다', async () => {
    const interaction = makeInteraction();

    await command.onHelp(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it('WEB_URL 미설정 시 https://onyu.dev 로 폴백한다', async () => {
    delete process.env['WEB_URL'];
    const interaction = makeInteraction();

    await command.onHelp(interaction);

    expect(getReplyDescription(interaction)).toContain('https://onyu.dev/select-guild');
  });

  it('BotApiClientService 를 주입받지 않는다(DB/LLM 미호출 증명 — 생성자 시그니처)', () => {
    expect(HelpCommand.length).toBe(2);
  });
});

describe('HelpCommand — 로케일 해석(LocaleResolverService 연동, F-GENERAL-005)', () => {
  afterEach(() => {
    if (originalWebUrl === undefined) {
      delete process.env['WEB_URL'];
    } else {
      process.env['WEB_URL'] = originalWebUrl;
    }
  });

  it('저장된 user locale(en)이 interaction.locale(ko)보다 우선한다', async () => {
    const i18n = new BotI18nService();
    i18n.onModuleInit();
    const command = new HelpCommand(
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: 'en' }),
      } as unknown as BotApiClientService),
    );
    const interaction = makeInteraction({ locale: 'ko' });

    await command.onHelp(interaction);

    expect(getReplyDescription(interaction)).toContain(
      'Onyu tracks voice activity and helps you run your server.',
    );
  });

  it('저장된 locale 이 없고 interaction.locale 이 미지원 값이면 기본 로케일(en)로 폴백한다', async () => {
    const i18n = new BotI18nService();
    i18n.onModuleInit();
    const command = new HelpCommand(
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
    );
    const interaction = makeInteraction({ locale: 'fr' });

    await command.onHelp(interaction);

    expect(getReplyDescription(interaction)).toContain(
      'Onyu tracks voice activity and helps you run your server.',
    );
  });

  it('getUserLocale 조회 실패 시에도 삼키고 interaction.locale(ko)로 정상 응답한다', async () => {
    const i18n = new BotI18nService();
    i18n.onModuleInit();
    const command = new HelpCommand(
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockRejectedValue(new Error('bot-api down')),
      } as unknown as BotApiClientService),
    );
    const interaction = makeInteraction({ locale: 'ko' });

    await command.onHelp(interaction);

    expect(getReplyDescription(interaction)).toContain(
      '음성 활동을 추적하고 서버 운영을 돕는 디스코드 봇이에요.',
    );
  });
});
