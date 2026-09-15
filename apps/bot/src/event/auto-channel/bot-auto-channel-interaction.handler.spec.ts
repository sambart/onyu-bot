/**
 * BotAutoChannelInteractionHandler 단위 테스트 (신규 — auto-channel-name-input §7-2).
 *
 * 목 객체는 `Partial<discord.js 클래스>` 패턴을 피하고, 핸들러가 실제로 사용하는 속성만
 * 가진 plain object를 만들어 `as unknown as X`로 좁힌다(`bot-status-prefix-interaction
 * .handler.spec.ts` 관례 — `Partial<>` 패턴은 tsc --noEmit 회귀를 낸다).
 */
import { Logger } from '@nestjs/common';
import type { BotApiClientService } from '@onyu/bot-api-client';
import type { ButtonInteraction, Client, ModalSubmitInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { BotI18nService } from '../../common/application/bot-i18n.service';
import type { LocaleResolverService } from '../../common/application/locale-resolver.service';
import {
  BotAutoChannelInteractionHandler,
  parseAutoCustomId,
} from './bot-auto-channel-interaction.handler';

interface ModalTextInputJson {
  custom_id: string;
  min_length?: number;
  max_length?: number;
  required?: boolean;
  placeholder?: string;
  label?: string;
}

function getModalTextInput(modal: { toJSON(): { components: { components: unknown[] }[] } }) {
  const json = modal.toJSON();
  return json.components[0].components[0] as unknown as ModalTextInputJson;
}

function makeButtonInteraction(overrides: Record<string, unknown> = {}): ButtonInteraction {
  return {
    isButton: () => true,
    isModalSubmit: () => false,
    customId: 'auto_btn:10',
    guildId: 'guild-1',
    user: { id: 'user-1', displayName: 'Onyu' },
    locale: 'ko',
    deferReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
    replied: false,
    deferred: false,
    ...overrides,
  } as unknown as ButtonInteraction;
}

function makeModalSubmitInteraction(
  overrides: Record<string, unknown> = {},
): ModalSubmitInteraction {
  return {
    isButton: () => false,
    isModalSubmit: () => true,
    customId: 'auto_name_btn:10',
    guildId: 'guild-1',
    user: { id: 'user-1', displayName: 'Onyu' },
    locale: 'ko',
    deferReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    replied: false,
    deferred: false,
    fields: { getTextInputValue: vi.fn().mockReturnValue('발로란트') },
    ...overrides,
  } as unknown as ModalSubmitInteraction;
}

function makeDiscordClient(): Client {
  return { guilds: { cache: { get: () => undefined } } } as unknown as Client;
}

describe('parseAutoCustomId (§3-1)', () => {
  it("접미사 없음(auto_btn:{id}) → kind='button', mode='off'", () => {
    expect(parseAutoCustomId('auto_btn:10')).toEqual({ kind: 'button', buttonId: 10, mode: 'off' });
  });

  it("auto_btn:{id}:o → mode='optional'", () => {
    expect(parseAutoCustomId('auto_btn:10:o')).toEqual({
      kind: 'button',
      buttonId: 10,
      mode: 'optional',
    });
  });

  it("auto_btn:{id}:r → mode='required'", () => {
    expect(parseAutoCustomId('auto_btn:10:r')).toEqual({
      kind: 'button',
      buttonId: 10,
      mode: 'required',
    });
  });

  it("auto_btn:{id}:x(이상값) → mode='invalid'", () => {
    expect(parseAutoCustomId('auto_btn:10:x')).toEqual({
      kind: 'button',
      buttonId: 10,
      mode: 'invalid',
    });
  });

  it('레거시 하위 선택지(auto_sub:{id}, 접미사 없음) → buttonId 없이 mode=off', () => {
    expect(parseAutoCustomId('auto_sub:20')).toEqual({ kind: 'sub', subOptionId: 20, mode: 'off' });
  });

  it('신규 하위 선택지(auto_sub:{id}:{buttonId}:r) → buttonId 포함', () => {
    expect(parseAutoCustomId('auto_sub:20:10:r')).toEqual({
      kind: 'sub',
      subOptionId: 20,
      buttonId: 10,
      mode: 'required',
    });
  });

  it('NaN id는 null을 반환한다(errors.invalidRequest 경로)', () => {
    expect(parseAutoCustomId('auto_btn:abc')).toBeNull();
    expect(parseAutoCustomId('auto_sub:abc')).toBeNull();
  });

  it('auto_ 접두사가 없으면 null', () => {
    expect(parseAutoCustomId('other_btn:1')).toBeNull();
  });
});

describe('BotAutoChannelInteractionHandler', () => {
  let handler: BotAutoChannelInteractionHandler;
  let apiClient: {
    autoChannelButtonClick: Mock;
    autoChannelSubOption: Mock;
    autoChannelNameInput: Mock;
    autoChannelNameSubmit: Mock;
  };
  let i18n: { t: Mock };
  let localeResolver: { resolve: Mock };
  let discord: Client;

  beforeEach(() => {
    apiClient = {
      autoChannelButtonClick: vi.fn().mockResolvedValue({ action: 'created', message: 'ok' }),
      autoChannelSubOption: vi.fn().mockResolvedValue({ action: 'created', message: 'ok' }),
      autoChannelNameInput: vi.fn().mockResolvedValue({
        mode: 'required',
        templatePreview: '{input}의 방',
        minLength: 2,
        maxLength: 50,
        placeholder: '양식: {input}의 방',
      }),
      autoChannelNameSubmit: vi.fn().mockResolvedValue({ action: 'created', message: 'ok' }),
    };
    i18n = { t: vi.fn((_locale: string, key: string) => key) };
    localeResolver = { resolve: vi.fn().mockResolvedValue('ko') };
    discord = makeDiscordClient();

    handler = new BotAutoChannelInteractionHandler(
      apiClient as unknown as BotApiClientService,
      discord,
      i18n as unknown as BotI18nService,
      localeResolver as unknown as LocaleResolverService,
    );
  });

  describe('off 경로 (레거시, 동작 무변경)', () => {
    it('deferReply를 호출한다', async () => {
      const interaction = makeButtonInteraction({ customId: 'auto_btn:10' });

      await handler.handle(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(apiClient.autoChannelButtonClick).toHaveBeenCalledOnce();
    });

    it('구버전 customId(모드 세그먼트 없음)는 N3(name-input)를 호출하지 않는다(EC-ACNI-46)', async () => {
      const interaction = makeButtonInteraction({ customId: 'auto_btn:10' });

      await handler.handle(interaction);

      expect(apiClient.autoChannelNameInput).not.toHaveBeenCalled();
      expect(interaction.showModal).not.toHaveBeenCalled();
      expect(apiClient.autoChannelButtonClick).toHaveBeenCalledOnce();
    });

    it('이상 모드(o/r 이외) → logger.error + ephemeral 오류, api 미호출', async () => {
      const interaction = makeButtonInteraction({ customId: 'auto_btn:10:x' });

      await handler.handle(interaction);

      expect(apiClient.autoChannelButtonClick).not.toHaveBeenCalled();
      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true, content: 'voice.autoChannelNameInvalidMode' }),
      );
    });
  });

  describe('mode=optional/required 진입 (N3, showModal)', () => {
    it('deferReply를 호출하지 않고 showModal을 호출한다', async () => {
      const interaction = makeButtonInteraction({ customId: 'auto_btn:10:r' });

      await handler.handle(interaction);

      expect(interaction.deferReply).not.toHaveBeenCalled();
      expect(interaction.showModal).toHaveBeenCalledOnce();
    });

    it('N3 실패(throw) → ephemeral 오류 1줄 + showModal 0회 + name-submit 0회(D-9)', async () => {
      apiClient.autoChannelNameInput.mockRejectedValue(new Error('timeout'));
      const interaction = makeButtonInteraction({ customId: 'auto_btn:10:o' });

      await handler.handle(interaction);

      expect(interaction.showModal).not.toHaveBeenCalled();
      expect(apiClient.autoChannelNameSubmit).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          ephemeral: true,
          content: 'voice.autoChannelNameInputUnavailable',
        }),
      );
    });

    it("setMinLength는 mode='required'일 때만 호출된다", async () => {
      const interaction = makeButtonInteraction({ customId: 'auto_btn:10:r' });

      await handler.handle(interaction);

      const modal = (interaction.showModal as Mock).mock.calls[0][0];
      const input = getModalTextInput(modal);
      expect(input.min_length).toBe(2);
      expect(input.required).toBe(true);
    });

    it("mode='optional'이면 setMinLength가 호출되지 않는다(빈 입력 허용 계약 보존)", async () => {
      apiClient.autoChannelNameInput.mockResolvedValue({
        mode: 'optional',
        templatePreview: '{input}의 방',
        minLength: 2,
        maxLength: 50,
        placeholder: '양식: {input}의 방',
      });
      const interaction = makeButtonInteraction({ customId: 'auto_btn:10:o' });

      await handler.handle(interaction);

      const modal = (interaction.showModal as Mock).mock.calls[0][0];
      const input = getModalTextInput(modal);
      expect(input.min_length).toBeUndefined();
      expect(input.required).toBe(false);
    });

    it('setMaxLength(spec.maxLength)가 실제 적용된다(EC-ACNI-57)', async () => {
      apiClient.autoChannelNameInput.mockResolvedValue({
        mode: 'required',
        templatePreview: '{input}의 방',
        minLength: 2,
        maxLength: 37,
        placeholder: '양식: {input}의 방',
      });
      const interaction = makeButtonInteraction({ customId: 'auto_btn:10:r' });

      await handler.handle(interaction);

      const modal = (interaction.showModal as Mock).mock.calls[0][0];
      const input = getModalTextInput(modal);
      expect(input.max_length).toBe(37);
    });

    it('모달 customId는 auto_name_btn:{buttonId} 형식이다', async () => {
      const interaction = makeButtonInteraction({ customId: 'auto_btn:10:r' });

      await handler.handle(interaction);

      const modal = (interaction.showModal as Mock).mock.calls[0][0];
      expect(modal.toJSON().custom_id).toBe('auto_name_btn:10');
    });

    it('하위 선택지 모달 customId는 auto_name_sub:{subOptionId}:{buttonId} 형식이다', async () => {
      const interaction = makeButtonInteraction({ customId: 'auto_sub:20:10:r' });

      await handler.handle(interaction);

      const modal = (interaction.showModal as Mock).mock.calls[0][0];
      expect(modal.toJSON().custom_id).toBe('auto_name_sub:20:10');
    });
  });

  describe('재입력 버튼(auto_name_retry)', () => {
    it('N3를 재조회한 후 showModal을 호출한다', async () => {
      const interaction = makeButtonInteraction({ customId: 'auto_name_retry:btn:10' });

      await handler.handle(interaction);

      expect(apiClient.autoChannelNameInput).toHaveBeenCalledWith(
        expect.objectContaining({ buttonId: 10 }),
      );
      expect(interaction.showModal).toHaveBeenCalledOnce();
      expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    it('하위 선택지 재입력도 buttonId/subOptionId를 복원해 재조회한다', async () => {
      const interaction = makeButtonInteraction({ customId: 'auto_name_retry:sub:20:10' });

      await handler.handle(interaction);

      expect(apiClient.autoChannelNameInput).toHaveBeenCalledWith(
        expect.objectContaining({ buttonId: 10, subOptionId: 20 }),
      );
    });
  });

  describe('모달 제출 (N1)', () => {
    it('deferReply({ephemeral:true})를 호출한 뒤 name-submit을 호출한다', async () => {
      const interaction = makeModalSubmitInteraction({ customId: 'auto_name_btn:10' });

      await handler.handle(interaction);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(apiClient.autoChannelNameSubmit).toHaveBeenCalledOnce();
    });

    it('빈 입력은 항상 ""로 정규화되어 전송된다(null 금지)', async () => {
      const interaction = makeModalSubmitInteraction({
        customId: 'auto_name_btn:10',
        fields: { getTextInputValue: vi.fn().mockReturnValue('') },
      });

      await handler.handle(interaction);

      expect(apiClient.autoChannelNameSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ userInput: '' }),
      );
    });

    it("action='validation_error'에만 [다시 입력] 버튼 컴포넌트가 실린다", async () => {
      apiClient.autoChannelNameSubmit.mockResolvedValue({
        action: 'validation_error',
        message: '방 제목을 입력해야 방을 만들 수 있어요.',
        code: 'ERR_AUTO_CHANNEL_NAME_REQUIRED',
      });
      const interaction = makeModalSubmitInteraction({ customId: 'auto_name_btn:10' });

      await handler.handle(interaction);

      const call = (interaction.editReply as Mock).mock.calls[0][0];
      expect(call.components).toHaveLength(1);
    });

    it("action='created'는 컴포넌트가 없다", async () => {
      apiClient.autoChannelNameSubmit.mockResolvedValue({ action: 'created', message: '생성됨' });
      const interaction = makeModalSubmitInteraction({ customId: 'auto_name_btn:10' });

      await handler.handle(interaction);

      const call = (interaction.editReply as Mock).mock.calls[0][0];
      expect(call.components).toBeUndefined();
    });

    it("action='error'는 컴포넌트가 없다", async () => {
      apiClient.autoChannelNameSubmit.mockResolvedValue({ action: 'error', message: '오류' });
      const interaction = makeModalSubmitInteraction({ customId: 'auto_name_btn:10' });

      await handler.handle(interaction);

      const call = (interaction.editReply as Mock).mock.calls[0][0];
      expect(call.components).toBeUndefined();
    });

    it('N1 throw 시 빈 로딩 없이 폴백 문구로 editReply한다(D-9, EC-ACNI-23·39)', async () => {
      apiClient.autoChannelNameSubmit.mockRejectedValue(new Error('500'));
      const interaction = makeModalSubmitInteraction({ customId: 'auto_name_btn:10' });

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({
        content: 'voice.autoChannelNameInputUnavailable',
      });
    });

    it('하위 선택지 모달 제출은 subOptionId만 전달하고 buttonId는 전달하지 않는다', async () => {
      const interaction = makeModalSubmitInteraction({ customId: 'auto_name_sub:20:10' });

      await handler.handle(interaction);

      expect(apiClient.autoChannelNameSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ subOptionId: 20, buttonId: undefined }),
      );
    });

    it('deferReply가 reject(10062)해도 throw하지 않고 logger.error로 기록한다(EC-ACNI-38)', async () => {
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined as never);
      const interaction = makeModalSubmitInteraction({
        customId: 'auto_name_btn:10',
        deferReply: vi
          .fn()
          .mockRejectedValue(new Error('DiscordAPIError[10062]: Unknown interaction')),
        // editReply도 미확인 인터랙션에서는 실패한다 — 내부 try/catch로 흡수돼야 한다.
        editReply: vi
          .fn()
          .mockRejectedValue(new Error('DiscordAPIError[10062]: Unknown interaction')),
      });

      await expect(handler.handle(interaction)).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalled();
      expect(apiClient.autoChannelNameSubmit).not.toHaveBeenCalled();
    });
  });
});
