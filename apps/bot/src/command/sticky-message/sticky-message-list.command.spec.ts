/**
 * StickyMessageListCommand 단위 테스트 — `/sticky-list`(`고정메세지목록`)의 i18n 보간 인자
 * 배선을 검증한다(계획 `docs/plans/i18n-p3-remainders.md` §6 D4 · §6-1, i18n 감사 P3 [S] 권고분).
 *
 * `sticky-message-delete.command.spec.ts` 와 동일 목적·동형 구조 — `bot-i18n-locale-parity.spec.ts`
 * 가 이미 봉인한 ko/en 키 존재·패리티는 재단언하지 않고, **보간 인자(`{count}`/`{title}`/
 * `{status}`/`{message}`)가 실제로 채워지는가**만 본다. i18n 은 실제 로케일 JSON 을 로드하고
 * (`new BotI18nService(); i18n.onModuleInit();`), 기대값은 `i18n.t()` 호출로 산출한다
 * (하드코딩 원문 대신 — 이유는 delete spec 헤더 참조).
 *
 * list 는 4종 보간(delete 의 2종 대비 최다)에 더해 **Embed 필드 조립**까지 있어
 * 인자 누락 가능성이 가장 큰 표면이다(계획 §6 D4).
 */
import type { BotApiClientService, StickyMessageConfigItem } from '@onyu/bot-api-client';
import type { CommandInteraction, EmbedBuilder } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { StickyMessageListCommand } from './sticky-message-list.command';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';

/** 미치환 `{word}` 리터럴이 남아 있지 않은지 확인하는 회귀 가드. */
const UNSUBSTITUTED_PLACEHOLDER = /\{[a-zA-Z]+\}/;

function makeInteraction(overrides: Record<string, unknown> = {}): CommandInteraction {
  return {
    guildId: GUILD_ID,
    locale: 'ko',
    user: { id: USER_ID },
    memberPermissions: { has: vi.fn().mockReturnValue(true) },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as CommandInteraction;
}

function getEditReplyStringContent(interaction: CommandInteraction): string {
  return (interaction.editReply as Mock).mock.calls[0][0] as string;
}

function getEditReplyEmbedJson(interaction: CommandInteraction): Record<string, unknown> {
  const call = (interaction.editReply as Mock).mock.calls[0][0] as { embeds: EmbedBuilder[] };
  return call.embeds[0].toJSON() as Record<string, unknown>;
}

function makeConfigs(): StickyMessageConfigItem[] {
  return [
    { channelId: 'channel-1', embedTitle: '환영합니다', enabled: true },
    { channelId: 'channel-2', embedTitle: null, enabled: false },
  ];
}

describe('StickyMessageListCommand', () => {
  let command: StickyMessageListCommand;
  let apiClient: { getStickyMessageConfigs: Mock };
  let i18n: BotI18nService;

  beforeEach(() => {
    apiClient = { getStickyMessageConfigs: vi.fn() };

    i18n = new BotI18nService();
    i18n.onModuleInit();
    command = new StickyMessageListCommand(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
    );
  });

  // ─── 권한 없음(:34) ─────────────────────────────────────────────────────────

  it('ManageGuild 권한이 없으면 errors.manageGuildOnly 로 reply 하고 API/deferReply 를 호출하지 않는다', async () => {
    const interaction = makeInteraction({
      memberPermissions: { has: vi.fn().mockReturnValue(false) },
    });

    await command.onList(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: i18n.t('ko', 'errors.manageGuildOnly'),
      ephemeral: true,
    });
    expect(apiClient.getStickyMessageConfigs).not.toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  // ─── 길드 밖(:43) ────────────────────────────────────────────────────────────

  it('길드 밖(guildId: null)이면 errors.guildOnly 로 reply 하고 API/deferReply 를 호출하지 않는다', async () => {
    const interaction = makeInteraction({ guildId: null });

    await command.onList(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: i18n.t('ko', 'errors.guildOnly'),
      ephemeral: true,
    });
    expect(apiClient.getStickyMessageConfigs).not.toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  // ─── 빈 목록(:57) — 보간 없음 ─────────────────────────────────────────────────

  it('설정이 0건이면 stickyListEmpty 로 editReply 한다', async () => {
    apiClient.getStickyMessageConfigs.mockResolvedValue({ ok: true, data: [] });
    const interaction = makeInteraction();

    await command.onList(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    const content = getEditReplyStringContent(interaction);
    expect(content).toBe(i18n.t('ko', 'commands.stickyListEmpty'));
  });

  // ─── Embed 조립(:63-87) — {count}·{title}·{status} 보간 ──────────────────────

  it('설정이 있으면 title/footer({count})/fields({title},{status})가 모두 보간된 Embed 로 editReply 한다', async () => {
    apiClient.getStickyMessageConfigs.mockResolvedValue({ ok: true, data: makeConfigs() });
    const interaction = makeInteraction();

    await command.onList(interaction);

    const embedJson = getEditReplyEmbedJson(interaction);
    expect(embedJson['title']).toBe(i18n.t('ko', 'commands.stickyListTitle'));
    expect((embedJson['footer'] as { text: string }).text).toBe(
      i18n.t('ko', 'commands.stickyListFooter', { count: 2 }),
    );

    const fields = embedJson['fields'] as { name: string; value: string }[];
    expect(fields).toHaveLength(2);

    // 제목 있는 채널 — {title} 보간 + 켜짐 상태
    expect(fields[0].name).toBe('#1 <#channel-1>');
    expect(fields[0].value).toBe(
      [
        i18n.t('ko', 'commands.stickyListTitleField', { title: '환영합니다' }),
        i18n.t('ko', 'commands.stickyListEnabledField', {
          status: i18n.t('ko', 'commands.stickyListOn'),
        }),
      ].join('\n'),
    );

    // 제목 없는 채널 — stickyListNoTitle 이 {title}로 간접 합성 + 꺼짐 상태
    expect(fields[1].name).toBe('#2 <#channel-2>');
    expect(fields[1].value).toBe(
      [
        i18n.t('ko', 'commands.stickyListTitleField', {
          title: i18n.t('ko', 'commands.stickyListNoTitle'),
        }),
        i18n.t('ko', 'commands.stickyListEnabledField', {
          status: i18n.t('ko', 'commands.stickyListOff'),
        }),
      ].join('\n'),
    );

    expect(JSON.stringify(embedJson)).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);
  });

  // ─── catch — Error 인스턴스 ────────────────────────────────────────────────

  it('API 호출이 Error로 reject되면 error.message가 {message}에 보간된 stickyListError 로 editReply 한다', async () => {
    apiClient.getStickyMessageConfigs.mockRejectedValue(new Error('network fail'));
    const interaction = makeInteraction();

    await command.onList(interaction);

    const content = getEditReplyStringContent(interaction);
    expect(content).toBe(i18n.t('ko', 'commands.stickyListError', { message: 'network fail' }));
    expect(content).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);
  });

  // ─── catch — 비-Error throw → unknownError 간접 합성 ──────────────────────────

  it('API 호출이 Error가 아닌 값으로 reject되면 errors.unknownError가 {message}에 간접 합성된다', async () => {
    apiClient.getStickyMessageConfigs.mockRejectedValue('raw-string-rejection');
    const interaction = makeInteraction();

    await command.onList(interaction);

    const content = getEditReplyStringContent(interaction);
    const expectedMessage = i18n.t('ko', 'errors.unknownError');
    expect(content).toBe(i18n.t('ko', 'commands.stickyListError', { message: expectedMessage }));
    expect(content).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);
  });

  // ─── en 로케일 — Embed 조립 반복(§6-1 케이스 6) ──────────────────────────────

  it('en 로케일에서도 title/footer/fields 가 전부 보간되고 한글이 섞이지 않는다', async () => {
    // embedTitle 은 사용자 입력(설정값)이라 로케일 무관 — 라벨 계열(한글 미포함 여부)만
    // 검증하기 위해 en 표기 제목을 쓴다(delete spec 의 한글 부재 회귀 가드와 동일 목적).
    const enConfigs: StickyMessageConfigItem[] = [
      { channelId: 'channel-1', embedTitle: 'Welcome', enabled: true },
      { channelId: 'channel-2', embedTitle: null, enabled: false },
    ];
    apiClient.getStickyMessageConfigs.mockResolvedValue({ ok: true, data: enConfigs });
    const interaction = makeInteraction({ locale: 'en-US' });

    await command.onList(interaction);

    const embedJson = getEditReplyEmbedJson(interaction);
    expect(embedJson['title']).toBe(i18n.t('en', 'commands.stickyListTitle'));
    expect((embedJson['footer'] as { text: string }).text).toBe(
      i18n.t('en', 'commands.stickyListFooter', { count: 2 }),
    );

    const fields = embedJson['fields'] as { value: string }[];
    expect(fields[1].value).toBe(
      [
        i18n.t('en', 'commands.stickyListTitleField', {
          title: i18n.t('en', 'commands.stickyListNoTitle'),
        }),
        i18n.t('en', 'commands.stickyListEnabledField', {
          status: i18n.t('en', 'commands.stickyListOff'),
        }),
      ].join('\n'),
    );

    const serialized = JSON.stringify(embedJson);
    expect(serialized).not.toMatch(UNSUBSTITUTED_PLACEHOLDER);
    expect(serialized).not.toMatch(/[가-힣]/);
  });
});
