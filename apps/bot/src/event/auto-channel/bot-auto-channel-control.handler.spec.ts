/**
 * BotAutoChannelControlHandler 단위 테스트 (auto-channel-room-control §5-7, F-VOICE-149).
 *
 * 목 객체는 `Partial<discord.js 클래스>` 패턴을 피하고, 핸들러가 실제로 사용하는 속성만 가진
 * plain object 를 `as unknown as X` 로 좁힌다(기존 interaction handler spec 관례).
 * i18n 목은 키를 에코하지 않고 `[locale]key` 로 돌려줘 `resolveResultMessage` 의 "키 미존재 → wire message
 * 폴백" 분기와 실제 번역 분기를 구분한다.
 */
import { Logger } from '@nestjs/common';
import type { BotApiClientService } from '@onyu/bot-api-client';
import { MESSAGE_CODE } from '@onyu/shared';
import type { ButtonInteraction, Client, Interaction, ModalSubmitInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { BotI18nService } from '../../common/application/bot-i18n.service';
import type { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { BotAutoChannelControlHandler } from './bot-auto-channel-control.handler';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-owner';
const CHANNEL_ID = '123456789012345678';
const PANEL_MESSAGE_ID = '223456789012345678';

interface ModalInputJson {
  custom_id: string;
  style: number;
  label?: string;
  placeholder?: string;
  max_length?: number;
  required?: boolean;
  value?: string;
}

interface ModalJson {
  custom_id: string;
  title: string;
  components: { components: ModalInputJson[] }[];
}

function readModal(modal: { toJSON(): unknown }): { json: ModalJson; input: ModalInputJson } {
  const json = modal.toJSON() as ModalJson;
  return { json, input: json.components[0].components[0] };
}

function makeButtonInteraction(overrides: Record<string, unknown> = {}): ButtonInteraction {
  return {
    isButton: () => true,
    isModalSubmit: () => false,
    customId: `auto_ctl:lock:${CHANNEL_ID}`,
    guildId: GUILD_ID,
    channelId: CHANNEL_ID,
    user: { id: USER_ID },
    locale: 'ko',
    message: { id: PANEL_MESSAGE_ID },
    deferReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ButtonInteraction;
}

function makeModalInteraction(overrides: Record<string, unknown> = {}): ModalSubmitInteraction {
  return {
    isButton: () => false,
    isModalSubmit: () => true,
    customId: `auto_ctl_modal:limit:${CHANNEL_ID}`,
    guildId: GUILD_ID,
    channelId: CHANNEL_ID,
    user: { id: USER_ID },
    locale: 'ko',
    deferReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    fields: { getTextInputValue: vi.fn().mockReturnValue('7') },
    ...overrides,
  } as unknown as ModalSubmitInteraction;
}

/** 게이트웨이 캐시 대역 — 클릭자의 현재 음성 채널과 대상 채널의 현재 멤버를 정한다 */
function makeDiscordClient(options: {
  userVoiceChannelId?: string | null;
  channelMembers?: string[] | null;
}): Client {
  const { userVoiceChannelId = CHANNEL_ID, channelMembers = [USER_ID] } = options;
  const channel =
    channelMembers === null
      ? undefined
      : {
          isVoiceBased: () => true,
          members: new Map(channelMembers.map((id) => [id, { id }])),
        };
  return {
    guilds: {
      cache: {
        get: (id: string) =>
          id === GUILD_ID
            ? {
                voiceStates: {
                  cache: {
                    get: () =>
                      userVoiceChannelId === null ? undefined : { channelId: userVoiceChannelId },
                  },
                },
                channels: { cache: { get: () => channel } },
              }
            : undefined,
      },
    },
  } as unknown as Client;
}

describe('BotAutoChannelControlHandler', () => {
  let handler: BotAutoChannelControlHandler;
  let apiClient: {
    autoChannelControlCheck: Mock;
    autoChannelControlUserLimit: Mock;
    autoChannelControlLock: Mock;
  };
  let i18n: { t: Mock };
  let localeResolver: { resolve: Mock };
  let errorSpy: Mock;

  function build(discord: Client = makeDiscordClient({})): void {
    handler = new BotAutoChannelControlHandler(
      apiClient as unknown as BotApiClientService,
      discord,
      i18n as unknown as BotI18nService,
      localeResolver as unknown as LocaleResolverService,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined) as unknown as Mock;
    apiClient = {
      autoChannelControlCheck: vi.fn().mockResolvedValue({
        allowed: true,
        state: { locked: false, userLimit: 7 },
      }),
      autoChannelControlUserLimit: vi.fn().mockResolvedValue({
        action: 'updated',
        code: MESSAGE_CODE.AUTO_CHANNEL_CONTROL_LIMIT_UPDATED,
        message: '정원을 5명으로 변경했습니다.',
        params: { userLimit: 5 },
        state: { locked: false, userLimit: 5 },
      }),
      autoChannelControlLock: vi.fn().mockResolvedValue({
        action: 'updated',
        code: MESSAGE_CODE.AUTO_CHANNEL_CONTROL_LOCKED,
        message: '방을 잠갔습니다.',
        state: { locked: true },
      }),
    };
    i18n = { t: vi.fn((locale: string, key: string) => `[${locale}]${key}`) };
    localeResolver = { resolve: vi.fn().mockResolvedValue('ko') };
    build();
  });

  // ───────────────────────────────────────────────────────────────────────
  // 라우팅
  // ───────────────────────────────────────────────────────────────────────
  describe('interactionCreate 라우팅', () => {
    it('버튼도 모달도 아닌 인터랙션은 무시한다', async () => {
      const interaction = {
        isButton: () => false,
        isModalSubmit: () => false,
      } as unknown as Interaction;

      await handler.handle(interaction);

      expect(apiClient.autoChannelControlCheck).not.toHaveBeenCalled();
      expect(localeResolver.resolve).not.toHaveBeenCalled();
    });

    it.each([['auto_btn:10'], ['auto_sub:20'], ['auto_name_btn:10'], ['other:1']])(
      '다른 기능 버튼(%s)은 무시한다 — 응답도 API 호출도 없다',
      async (customId) => {
        const interaction = makeButtonInteraction({ customId });

        await handler.handle(interaction);

        expect(interaction.reply).not.toHaveBeenCalled();
        expect(interaction.deferReply).not.toHaveBeenCalled();
        expect(apiClient.autoChannelControlCheck).not.toHaveBeenCalled();
        expect(apiClient.autoChannelControlLock).not.toHaveBeenCalled();
      },
    );

    it('다른 기능 모달(방제 입력 auto_name_*)은 무시한다', async () => {
      const interaction = makeModalInteraction({ customId: 'auto_name_btn:10' });

      await handler.handle(interaction);

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(apiClient.autoChannelControlUserLimit).not.toHaveBeenCalled();
    });

    it('auto_ctl_modal: 이어도 limit 액션이 아니면 무시한다', async () => {
      const interaction = makeModalInteraction({ customId: `auto_ctl_modal:other:${CHANNEL_ID}` });

      await handler.handle(interaction);

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(apiClient.autoChannelControlUserLimit).not.toHaveBeenCalled();
    });

    it('길드 밖(DM, guildId null) 버튼은 응답 없이 종료한다', async () => {
      const interaction = makeButtonInteraction({ guildId: null });

      await handler.handle(interaction);

      expect(interaction.reply).not.toHaveBeenCalled();
      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(apiClient.autoChannelControlLock).not.toHaveBeenCalled();
    });

    it('길드 밖(DM) 모달 제출은 응답 없이 종료한다', async () => {
      const interaction = makeModalInteraction({ guildId: null });

      await handler.handle(interaction);

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(apiClient.autoChannelControlUserLimit).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // customId 검증 (EC-ACNI-68)
  // ───────────────────────────────────────────────────────────────────────
  describe('customId 검증 — API 호출 없이 errors.invalidRequest (EC-ACNI-68)', () => {
    it.each([
      ['channelId 가 숫자가 아님', 'auto_ctl:lock:abc', CHANNEL_ID],
      ['channelId 가 16자리(너무 짧음)', 'auto_ctl:lock:1234567890123456', '1234567890123456'],
      [
        'channelId 가 21자리(너무 김)',
        'auto_ctl:lock:123456789012345678901',
        '123456789012345678901',
      ],
      ['알 수 없는 action', `auto_ctl:explode:${CHANNEL_ID}`, CHANNEL_ID],
      ['channelId 누락', 'auto_ctl:lock:', CHANNEL_ID],
      ['추가 세그먼트', `auto_ctl:lock:${CHANNEL_ID}:extra`, CHANNEL_ID],
      ['interaction.channelId 와 다름', `auto_ctl:lock:${CHANNEL_ID}`, '999999999999999999'],
    ])('버튼 — %s', async (_label, customId, interactionChannelId) => {
      const interaction = makeButtonInteraction({ customId, channelId: interactionChannelId });

      await handler.handle(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        ephemeral: true,
        content: '[ko]errors.invalidRequest',
      });
      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(interaction.showModal).not.toHaveBeenCalled();
      expect(apiClient.autoChannelControlCheck).not.toHaveBeenCalled();
      expect(apiClient.autoChannelControlLock).not.toHaveBeenCalled();
    });

    it.each([
      ['channelId 가 숫자가 아님', 'auto_ctl_modal:limit:abc', CHANNEL_ID],
      ['interaction.channelId 와 다름', `auto_ctl_modal:limit:${CHANNEL_ID}`, '999999999999999999'],
    ])('모달 제출 — %s', async (_label, customId, interactionChannelId) => {
      const interaction = makeModalInteraction({ customId, channelId: interactionChannelId });

      await handler.handle(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        ephemeral: true,
        content: '[ko]errors.invalidRequest',
      });
      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(apiClient.autoChannelControlUserLimit).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // [정원 변경] 버튼 → AC3 → 모달
  // ───────────────────────────────────────────────────────────────────────
  describe('[정원 변경] 버튼 (AC3 사전 판정 → showModal)', () => {
    const limitButton = () => makeButtonInteraction({ customId: `auto_ctl:limit:${CHANNEL_ID}` });

    it('allowed 면 deferReply 없이 showModal 을 호출한다(모달은 첫 응답이어야 한다)', async () => {
      const interaction = limitButton();

      await handler.handle(interaction);

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(interaction.reply).not.toHaveBeenCalled();
      expect(interaction.showModal).toHaveBeenCalledTimes(1);
    });

    it('AC3 에 길드·클릭자·채널·클릭자의 현재 음성 채널을 싣는다', async () => {
      build(makeDiscordClient({ userVoiceChannelId: CHANNEL_ID }));

      await handler.handle(limitButton());

      expect(apiClient.autoChannelControlCheck).toHaveBeenCalledWith({
        guildId: GUILD_ID,
        userId: USER_ID,
        channelId: CHANNEL_ID,
        voiceChannelId: CHANNEL_ID,
      });
    });

    it('클릭자가 음성 채널에 없으면 voiceChannelId 는 null 로 보낸다', async () => {
      build(makeDiscordClient({ userVoiceChannelId: null }));

      await handler.handle(limitButton());

      expect(apiClient.autoChannelControlCheck).toHaveBeenCalledWith(
        expect.objectContaining({ voiceChannelId: null }),
      );
    });

    it('클릭자가 다른 음성 채널에 있으면 그 채널 ID 를 그대로 보낸다', async () => {
      build(makeDiscordClient({ userVoiceChannelId: '999999999999999999' }));

      await handler.handle(limitButton());

      expect(apiClient.autoChannelControlCheck).toHaveBeenCalledWith(
        expect.objectContaining({ voiceChannelId: '999999999999999999' }),
      );
    });

    it('로케일은 (userId, guildId, interaction.locale) 로 해석한다', async () => {
      await handler.handle(limitButton());

      expect(localeResolver.resolve).toHaveBeenCalledWith(USER_ID, GUILD_ID, 'ko');
    });

    it('로케일 조회가 끝나기 전에 AC3 가 이미 시작된다 — 두 왕복이 3초 데드라인 안에서 겹친다', async () => {
      let resolveLocale: (locale: string) => void = () => undefined;
      localeResolver.resolve.mockReturnValue(
        new Promise<string>((resolve) => {
          resolveLocale = resolve;
        }),
      );
      const interaction = limitButton();

      const pending = handler.handle(interaction);
      await Promise.resolve();

      expect(apiClient.autoChannelControlCheck).toHaveBeenCalledTimes(1);
      expect(interaction.showModal).not.toHaveBeenCalled();

      resolveLocale('ko');
      await pending;

      expect(interaction.showModal).toHaveBeenCalledTimes(1);
    });

    it('로케일 조회 중 AC3 가 먼저 reject 돼도 unhandled 없이 로케일 문구로 안내한다', async () => {
      let resolveLocale: (locale: string) => void = () => undefined;
      localeResolver.resolve.mockReturnValue(
        new Promise<string>((resolve) => {
          resolveLocale = resolve;
        }),
      );
      apiClient.autoChannelControlCheck.mockRejectedValue(new Error('timeout'));
      const interaction = limitButton();

      const pending = handler.handle(interaction);
      await Promise.resolve();
      resolveLocale('en');
      await pending;

      expect(interaction.showModal).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith({
        ephemeral: true,
        content: '[en]voice.autoChannelControlUnavailable',
      });
    });

    it('모달 사양: customId · 텍스트 입력 id(userLimit) · Short · maxLength 2 · required · i18n 문구', async () => {
      const interaction = limitButton();

      await handler.handle(interaction);

      const { json, input } = readModal((interaction.showModal as Mock).mock.calls[0][0]);
      expect(json.custom_id).toBe(`auto_ctl_modal:limit:${CHANNEL_ID}`);
      expect(json.title).toBe('[ko]voice.autoChannelControlLimitModalTitle');
      expect(input.custom_id).toBe('userLimit');
      expect(input.style).toBe(1); // TextInputStyle.Short
      expect(input.max_length).toBe(2);
      expect(input.required).toBe(true);
      expect(input.label).toBe('[ko]voice.autoChannelControlLimitInputLabel');
      expect(input.placeholder).toBe('[ko]voice.autoChannelControlLimitInputPlaceholder');
    });

    it('AC3 가 준 현재 정원을 입력란 기본값으로 채운다', async () => {
      apiClient.autoChannelControlCheck.mockResolvedValue({
        allowed: true,
        state: { locked: false, userLimit: 7 },
      });
      const interaction = limitButton();

      await handler.handle(interaction);

      const { input } = readModal((interaction.showModal as Mock).mock.calls[0][0]);
      expect(input.value).toBe('7');
    });

    it('현재 정원이 0(무제한)이어도 기본값 "0" 을 채운다', async () => {
      apiClient.autoChannelControlCheck.mockResolvedValue({
        allowed: true,
        state: { locked: false, userLimit: 0 },
      });
      const interaction = limitButton();

      await handler.handle(interaction);

      const { input } = readModal((interaction.showModal as Mock).mock.calls[0][0]);
      expect(input.value).toBe('0');
    });

    it('현재 정원을 모르면(state.userLimit 없음) 기본값을 채우지 않는다', async () => {
      apiClient.autoChannelControlCheck.mockResolvedValue({
        allowed: true,
        state: { locked: false },
      });
      const interaction = limitButton();

      await handler.handle(interaction);

      const { input } = readModal((interaction.showModal as Mock).mock.calls[0][0]);
      expect(input.value).toBeUndefined();
    });

    it('AC3 거절(NOT_OWNER)이면 모달 없이 해당 코드의 로케일 문구로 ephemeral reply', async () => {
      apiClient.autoChannelControlCheck.mockResolvedValue({
        allowed: false,
        code: MESSAGE_CODE.ERR_AUTO_CHANNEL_CONTROL_NOT_OWNER,
        message: '방 생성자만 조작할 수 있습니다.',
      });
      const interaction = limitButton();

      await handler.handle(interaction);

      expect(interaction.showModal).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith({
        ephemeral: true,
        content: '[ko]voice.autoChannelControlNotOwner',
      });
    });

    it('AC3 거절 코드가 매핑에 없으면 wire message 로 폴백한다', async () => {
      apiClient.autoChannelControlCheck.mockResolvedValue({
        allowed: false,
        code: 'ERR_SOMETHING_UNMAPPED',
        message: '서버가 준 한국어 문구',
      });
      const interaction = limitButton();

      await handler.handle(interaction);

      expect(interaction.reply).toHaveBeenCalledWith({
        ephemeral: true,
        content: '서버가 준 한국어 문구',
      });
    });

    it('AC3 호출이 실패(타임아웃·5xx)하면 모달 없이 사전판정 실패 문구 1줄, 모달 폴백 없음 (EC-ACNI-92)', async () => {
      apiClient.autoChannelControlCheck.mockRejectedValue(new Error('timeout of 1500ms exceeded'));
      const interaction = limitButton();

      await handler.handle(interaction);

      expect(interaction.showModal).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledTimes(1);
      expect(interaction.reply).toHaveBeenCalledWith({
        ephemeral: true,
        content: '[ko]voice.autoChannelControlUnavailable',
      });
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('showModal 자체가 실패해도 예외가 전파되지 않고 안내 reply 를 시도한다', async () => {
      const interaction = limitButton();
      (interaction.showModal as Mock).mockRejectedValue(new Error('Unknown interaction'));

      await expect(handler.handle(interaction)).resolves.toBeUndefined();

      expect(interaction.reply).toHaveBeenCalledWith({
        ephemeral: true,
        content: '[ko]voice.autoChannelControlUnavailable',
      });
    });

    it('안내 reply 마저 실패해도 예외가 전파되지 않는다', async () => {
      apiClient.autoChannelControlCheck.mockRejectedValue(new Error('down'));
      const interaction = limitButton();
      (interaction.reply as Mock).mockRejectedValue(new Error('already replied'));

      await expect(handler.handle(interaction)).resolves.toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // [잠금] / [잠금 해제]
  // ───────────────────────────────────────────────────────────────────────
  describe('[잠금] / [잠금 해제] 버튼 (AC5)', () => {
    const lockButton = (action: 'lock' | 'unlock' = 'lock') =>
      makeButtonInteraction({ customId: `auto_ctl:${action}:${CHANNEL_ID}` });

    it('deferReply(ephemeral) 후 AC5 를 호출하고 결과 문구로 editReply 한다', async () => {
      const interaction = lockButton();

      await handler.handle(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(apiClient.autoChannelControlLock).toHaveBeenCalledTimes(1);
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '[ko]voice.autoChannelControlLocked',
      });
      expect(interaction.showModal).not.toHaveBeenCalled();
    });

    it('[잠금] — locked=true, 클릭자 먼저 + 채널 안 멤버, panelMessageId=interaction.message.id', async () => {
      build(makeDiscordClient({ channelMembers: ['member-a', USER_ID, 'member-b'] }));

      await handler.handle(lockButton('lock'));

      expect(apiClient.autoChannelControlLock).toHaveBeenCalledWith({
        guildId: GUILD_ID,
        userId: USER_ID,
        channelId: CHANNEL_ID,
        voiceChannelId: CHANNEL_ID,
        locked: true,
        channelMemberIds: [USER_ID, 'member-a', 'member-b'],
        panelMessageId: PANEL_MESSAGE_ID,
      });
    });

    it('[잠금 해제] — locked=false 이고 channelMemberIds 는 빈 배열', async () => {
      build(makeDiscordClient({ channelMembers: ['member-a', USER_ID] }));

      await handler.handle(lockButton('unlock'));

      expect(apiClient.autoChannelControlLock).toHaveBeenCalledWith(
        expect.objectContaining({
          locked: false,
          channelMemberIds: [],
          panelMessageId: PANEL_MESSAGE_ID,
        }),
      );
    });

    it('클릭자가 캐시상 채널 멤버에 없어도 맨 앞에 포함한다', async () => {
      build(makeDiscordClient({ channelMembers: ['member-a'] }));

      await handler.handle(lockButton('lock'));

      const dto = apiClient.autoChannelControlLock.mock.calls[0][0] as {
        channelMemberIds: string[];
      };
      expect(dto.channelMemberIds).toEqual([USER_ID, 'member-a']);
    });

    it('채널이 캐시에 없으면 클릭자만 보낸다', async () => {
      build(makeDiscordClient({ channelMembers: null }));

      await handler.handle(lockButton('lock'));

      const dto = apiClient.autoChannelControlLock.mock.calls[0][0] as {
        channelMemberIds: string[];
      };
      expect(dto.channelMemberIds).toEqual([USER_ID]);
    });

    it('멤버가 100명을 넘으면 클릭자를 맨 앞에 두고 앞 100명으로 절단한다 (EC-ACNI-94 ⓐ, P5)', async () => {
      const many = Array.from({ length: 150 }, (_, i) => `member-${i}`);
      build(makeDiscordClient({ channelMembers: [...many, USER_ID] }));

      await handler.handle(lockButton('lock'));

      const dto = apiClient.autoChannelControlLock.mock.calls[0][0] as {
        channelMemberIds: string[];
      };
      expect(dto.channelMemberIds).toHaveLength(100);
      expect(dto.channelMemberIds[0]).toBe(USER_ID);
      expect(dto.channelMemberIds[1]).toBe('member-0');
      expect(new Set(dto.channelMemberIds).size).toBe(100);
    });

    it('클릭자가 방 밖이어도 voiceChannelId=null 로 API 에 위임한다(판정은 API 몫)', async () => {
      build(makeDiscordClient({ userVoiceChannelId: null }));

      await handler.handle(lockButton('lock'));

      expect(apiClient.autoChannelControlLock).toHaveBeenCalledWith(
        expect.objectContaining({ voiceChannelId: null }),
      );
    });

    it.each([
      [
        'denied NOT_OWNER',
        'denied',
        MESSAGE_CODE.ERR_AUTO_CHANNEL_CONTROL_NOT_OWNER,
        'voice.autoChannelControlNotOwner',
      ],
      [
        'denied NOT_FOUND',
        'denied',
        MESSAGE_CODE.ERR_AUTO_CHANNEL_CONTROL_NOT_FOUND,
        'voice.autoChannelControlNotFound',
      ],
      [
        'denied DISABLED',
        'denied',
        MESSAGE_CODE.ERR_AUTO_CHANNEL_CONTROL_DISABLED,
        'voice.autoChannelControlDisabled',
      ],
      [
        'denied OWNER_NOT_IN_CHANNEL',
        'denied',
        MESSAGE_CODE.ERR_AUTO_CHANNEL_CONTROL_OWNER_NOT_IN_CHANNEL,
        'voice.autoChannelControlOwnerNotInChannel',
      ],
      [
        'error BOT_PERMISSION',
        'error',
        MESSAGE_CODE.ERR_AUTO_CHANNEL_CONTROL_BOT_PERMISSION,
        'voice.autoChannelControlBotPermission',
      ],
      [
        'error FAILED',
        'error',
        MESSAGE_CODE.ERR_AUTO_CHANNEL_CONTROL_FAILED,
        'voice.autoChannelControlFailed',
      ],
      [
        'unchanged ALREADY_LOCKED',
        'unchanged',
        MESSAGE_CODE.AUTO_CHANNEL_CONTROL_ALREADY_LOCKED,
        'voice.autoChannelControlAlreadyLocked',
      ],
      [
        'unchanged ALREADY_UNLOCKED',
        'unchanged',
        MESSAGE_CODE.AUTO_CHANNEL_CONTROL_ALREADY_UNLOCKED,
        'voice.autoChannelControlAlreadyUnlocked',
      ],
      [
        'updated UNLOCKED',
        'updated',
        MESSAGE_CODE.AUTO_CHANNEL_CONTROL_UNLOCKED,
        'voice.autoChannelControlUnlocked',
      ],
    ])('API 결과 %s → 해당 로케일 키로 editReply', async (_label, action, code, key) => {
      apiClient.autoChannelControlLock.mockResolvedValue({ action, code, message: 'wire 폴백' });
      const interaction = lockButton();

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({ content: `[ko]${key}` });
    });

    it('코드가 없거나 미매핑인 결과는 wire message 로 폴백한다', async () => {
      apiClient.autoChannelControlLock.mockResolvedValue({
        action: 'error',
        message: '구 API 문구',
      });
      const interaction = lockButton();

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({ content: '구 API 문구' });
    });

    it('API 호출이 throw 하면 deferReply 이후이므로 폴백 문구로 editReply 한다 — 빈 로딩 방치 금지 (EC-ACNI-67)', async () => {
      apiClient.autoChannelControlLock.mockRejectedValue(new Error('500'));
      const interaction = lockButton();

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledTimes(1);
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '[ko]voice.autoChannelControlFailed',
      });
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('폴백 editReply 까지 실패해도 예외가 전파되지 않는다', async () => {
      apiClient.autoChannelControlLock.mockRejectedValue(new Error('500'));
      const interaction = lockButton();
      (interaction.editReply as Mock).mockRejectedValue(new Error('Unknown interaction'));

      await expect(handler.handle(interaction)).resolves.toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // 정원 모달 제출 (AC4)
  // ───────────────────────────────────────────────────────────────────────
  describe('정원 모달 제출 (AC4)', () => {
    it('deferReply(ephemeral) 후 입력 원문을 userLimitInput 으로 AC4 에 보내고 결과를 editReply 한다', async () => {
      const interaction = makeModalInteraction();

      await handler.handle(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(interaction.fields.getTextInputValue).toHaveBeenCalledWith('userLimit');
      expect(apiClient.autoChannelControlUserLimit).toHaveBeenCalledWith({
        guildId: GUILD_ID,
        userId: USER_ID,
        channelId: CHANNEL_ID,
        voiceChannelId: CHANNEL_ID,
        userLimitInput: '7',
      });
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '[ko]voice.autoChannelControlLimitUpdated',
      });
    });

    it('결과 params 를 번역 호출에 그대로 넘긴다(보간 값 userLimit)', async () => {
      await handler.handle(makeModalInteraction());

      expect(i18n.t).toHaveBeenCalledWith('ko', 'voice.autoChannelControlLimitUpdated', {
        userLimit: 5,
      });
    });

    it('입력 원문을 가공하지 않고 그대로 보낸다(trim·파싱은 서버 몫)', async () => {
      const interaction = makeModalInteraction({
        fields: { getTextInputValue: vi.fn().mockReturnValue(' 07 ') },
      });

      await handler.handle(interaction);

      expect(apiClient.autoChannelControlUserLimit).toHaveBeenCalledWith(
        expect.objectContaining({ userLimitInput: ' 07 ' }),
      );
    });

    it('입력값이 null/undefined 로 와도 빈 문자열("")로 보낸다 — API DTO 가 null 을 거부', async () => {
      const interaction = makeModalInteraction({
        fields: { getTextInputValue: vi.fn().mockReturnValue(null) },
      });

      await handler.handle(interaction);

      expect(apiClient.autoChannelControlUserLimit).toHaveBeenCalledWith(
        expect.objectContaining({ userLimitInput: '' }),
      );
    });

    it('정원 0 으로 바뀐 결과(LIMIT_UPDATED + userLimit 0)는 "제한 없음" 전용 문구를 쓴다', async () => {
      apiClient.autoChannelControlUserLimit.mockResolvedValue({
        action: 'updated',
        code: MESSAGE_CODE.AUTO_CHANNEL_CONTROL_LIMIT_UPDATED,
        message: '정원 제한을 없앴습니다.',
        params: { userLimit: 0 },
      });
      const interaction = makeModalInteraction();

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '[ko]voice.autoChannelControlLimitUnlimited',
      });
      expect(i18n.t).not.toHaveBeenCalledWith(
        'ko',
        'voice.autoChannelControlLimitUpdated',
        expect.anything(),
      );
    });

    it('userLimit 가 문자열 "0" 으로 와도 무제한 문구를 쓴다(params 직렬화 방어)', async () => {
      apiClient.autoChannelControlUserLimit.mockResolvedValue({
        action: 'updated',
        code: MESSAGE_CODE.AUTO_CHANNEL_CONTROL_LIMIT_UPDATED,
        message: 'x',
        params: { userLimit: '0' },
      });
      const interaction = makeModalInteraction();

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '[ko]voice.autoChannelControlLimitUnlimited',
      });
    });

    it('0 이 아닌 정원은 일반 변경 문구를 쓴다', async () => {
      apiClient.autoChannelControlUserLimit.mockResolvedValue({
        action: 'updated',
        code: MESSAGE_CODE.AUTO_CHANNEL_CONTROL_LIMIT_UPDATED,
        message: 'x',
        params: { userLimit: 10 },
      });
      const interaction = makeModalInteraction();

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '[ko]voice.autoChannelControlLimitUpdated',
      });
    });

    it('validation_error 는 min/max 보간 값과 함께 LIMIT_INVALID 문구로 안내한다', async () => {
      apiClient.autoChannelControlUserLimit.mockResolvedValue({
        action: 'validation_error',
        code: MESSAGE_CODE.ERR_AUTO_CHANNEL_CONTROL_LIMIT_INVALID,
        message: '0~99 사이의 숫자를 입력하세요.',
        params: { min: 0, max: 99 },
      });
      const interaction = makeModalInteraction();

      await handler.handle(interaction);

      expect(i18n.t).toHaveBeenCalledWith('ko', 'voice.autoChannelControlLimitInvalid', {
        min: 0,
        max: 99,
      });
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '[ko]voice.autoChannelControlLimitInvalid',
      });
    });

    it('거절(denied) 결과도 해당 문구로 안내한다 (EC-ACNI-104 — 모달 연 채 방을 떠남)', async () => {
      apiClient.autoChannelControlUserLimit.mockResolvedValue({
        action: 'denied',
        code: MESSAGE_CODE.ERR_AUTO_CHANNEL_CONTROL_OWNER_NOT_IN_CHANNEL,
        message: 'x',
      });
      const interaction = makeModalInteraction();

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '[ko]voice.autoChannelControlOwnerNotInChannel',
      });
    });

    it('제출 시점의 음성 채널 상태를 다시 읽어 보낸다(방을 떠났다면 null)', async () => {
      build(makeDiscordClient({ userVoiceChannelId: null }));

      await handler.handle(makeModalInteraction());

      expect(apiClient.autoChannelControlUserLimit).toHaveBeenCalledWith(
        expect.objectContaining({ voiceChannelId: null }),
      );
    });

    it('API 호출이 throw 하면 deferReply 이후이므로 폴백 문구로 editReply (EC-ACNI-67)', async () => {
      apiClient.autoChannelControlUserLimit.mockRejectedValue(new Error('400 Bad Request'));
      const interaction = makeModalInteraction();

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledTimes(1);
      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '[ko]voice.autoChannelControlFailed',
      });
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('로케일 해석이 실패해도 예외가 전파되지 않고 API 는 호출되지 않는다', async () => {
      localeResolver.resolve.mockRejectedValue(new Error('locale api down'));
      const interaction = makeModalInteraction();

      await expect(handler.handle(interaction)).resolves.toBeUndefined();

      expect(apiClient.autoChannelControlUserLimit).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('로케일이 en 이면 영어 로케일 키로 번역한다', async () => {
      localeResolver.resolve.mockResolvedValue('en');
      const interaction = makeModalInteraction();

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: '[en]voice.autoChannelControlLimitUpdated',
      });
    });
  });
});
