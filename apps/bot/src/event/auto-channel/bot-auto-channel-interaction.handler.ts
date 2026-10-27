import { InjectDiscordClient, On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { AutoChannelButtonResult, AutoChannelNameInputSpec } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import { DEFAULT_LOCALE, isSupportedLocale } from '@onyu/shared';
import type {
  ButtonInteraction,
  Interaction,
  ModalSubmitInteraction,
  RepliableInteraction,
} from 'discord.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { resolveResultMessage } from '../../common/application/message-code-map';

const CUSTOM_ID_PREFIX = {
  BUTTON: 'auto_btn:',
  SUB_OPTION: 'auto_sub:',
  MODAL_BUTTON: 'auto_name_btn:',
  MODAL_SUB: 'auto_name_sub:',
  RETRY: 'auto_name_retry:',
} as const;

/** 모달 텍스트 입력 필드 customId (F-VOICE-126). */
const NAME_INPUT_FIELD_ID = 'roomName';

/** Discord 버튼 제약: ActionRow당 최대 버튼 수 */
const BUTTONS_PER_ROW = 5;

type AutoChannelNameInputMode = 'off' | 'optional' | 'required';

/**
 * customId 파싱 결과(§3-1). `mode`가 `'invalid'`면 `o`/`r` 이외의 접미사가 실린 것 —
 * 설정 불일치를 조용히 `off`로 폴백하지 않는다(F-VOICE-127, 관리자 정책 무력화 방지).
 */
export interface ParsedAutoCustomId {
  kind: 'button' | 'sub';
  buttonId?: number;
  subOptionId?: number;
  mode: AutoChannelNameInputMode | 'invalid';
}

/**
 * auto_btn/auto_sub customId를 파싱한다(§3-1 정본, 예외 없음).
 * - 접미 세그먼트가 없으면 `off`(저장 전 발행된 낡은 안내 메시지 하위호환, F-VOICE-126)
 * - 접미 세그먼트가 `o`/`r` 이외의 값이면 `invalid`(호출측이 ephemeral 오류로 처리)
 * - id가 숫자가 아니면 `null`(기존 `errors.invalidRequest` 경로)
 */
export function parseAutoCustomId(customId: string): ParsedAutoCustomId | null {
  if (customId.startsWith(CUSTOM_ID_PREFIX.BUTTON)) {
    const rest = customId.slice(CUSTOM_ID_PREFIX.BUTTON.length);
    const [idPart, modeSegment] = rest.split(':');
    const buttonId = parseInt(idPart, 10);
    if (isNaN(buttonId)) return null;
    return { kind: 'button', buttonId, mode: parseModeSegment(modeSegment) };
  }

  if (customId.startsWith(CUSTOM_ID_PREFIX.SUB_OPTION)) {
    const rest = customId.slice(CUSTOM_ID_PREFIX.SUB_OPTION.length);
    const parts = rest.split(':');
    const subOptionId = parseInt(parts[0], 10);
    if (isNaN(subOptionId)) return null;

    if (parts.length === 1) {
      return { kind: 'sub', subOptionId, mode: 'off' };
    }

    const buttonId = parseInt(parts[1], 10);
    if (isNaN(buttonId)) return null;
    return { kind: 'sub', subOptionId, buttonId, mode: parseModeSegment(parts[2]) };
  }

  return null;
}

function parseModeSegment(segment: string | undefined): AutoChannelNameInputMode | 'invalid' {
  if (segment === undefined) return 'off';
  if (segment === 'o') return 'optional';
  if (segment === 'r') return 'required';
  return 'invalid';
}

/**
 * Discord interactionCreate 이벤트를 수신하여 auto_btn/auto_sub 버튼과 방제 자유 입력
 * 모달(auto_name_*, F-VOICE-125~133)을 처리한다.
 * 비즈니스 로직(설정 검증, 채널 생성, 유저 이동, 양식 검증)은 API에 위임하고,
 * Discord 응답(deferReply/showModal/editReply)은 Bot에서 직접 수행한다.
 */
@Injectable()
export class BotAutoChannelInteractionHandler {
  private readonly logger = new Logger(BotAutoChannelInteractionHandler.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    @InjectDiscordClient() private readonly discord: Client,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @On('interactionCreate')
  async handle(interaction: Interaction): Promise<void> {
    if (interaction.isButton()) {
      await this.handleButtonInteraction(interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      await this.handleModalSubmitInteraction(interaction);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 버튼 클릭
  // ─────────────────────────────────────────────────────────────────────────

  private async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;

    if (customId.startsWith(CUSTOM_ID_PREFIX.RETRY)) {
      await this.handleRetryButton(interaction);
      return;
    }

    const isButton = customId.startsWith(CUSTOM_ID_PREFIX.BUTTON);
    const isSubOption = customId.startsWith(CUSTOM_ID_PREFIX.SUB_OPTION);
    if (!isButton && !isSubOption) return;
    if (!interaction.guildId) return;

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const locale = await this.localeResolver.resolve(userId, guildId, interaction.locale);

    const parsed = parseAutoCustomId(customId);
    if (!parsed) {
      await this.safeReply(interaction, this.i18n.t(locale, 'errors.invalidRequest'));
      return;
    }

    if (parsed.mode === 'invalid') {
      this.logger.error(`[AUTO_CHANNEL] Invalid mode segment in customId: ${customId}`);
      await this.safeReply(interaction, this.i18n.t(locale, 'voice.autoChannelNameInvalidMode'));
      return;
    }

    if (parsed.mode === 'off') {
      await this.handleLegacyClick(interaction, parsed, guildId, userId, locale);
      return;
    }

    await this.handleNameInputEntry(interaction, parsed, { guildId, locale });
  }

  /** off 모드(낡은 안내 메시지 포함) — 현행 button-click/sub-option 흐름, 동작 무변경. */
  private async handleLegacyClick(
    interaction: ButtonInteraction,
    parsed: ParsedAutoCustomId,
    guildId: string,
    userId: string,
    locale: string,
  ): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Gateway 캐시에서 voice state 확보 (REST fetch에는 voice 정보 없음)
      const guild = this.discord.guilds.cache.get(guildId);
      const voiceState = guild?.voiceStates.cache.get(userId);
      const voiceChannelId = voiceState?.channelId ?? null;
      const member = guild?.members.cache.get(userId);
      const displayName = member?.displayName ?? interaction.user.displayName;

      this.logger.debug(
        `[AUTO_CHANNEL] guild=${!!guild} voiceState=${!!voiceState} voiceChannelId=${voiceChannelId !== null} member=${!!member}`,
      );

      let result: AutoChannelButtonResult;

      if (parsed.kind === 'button') {
        result = await this.apiClient.autoChannelButtonClick({
          guildId,
          userId,
          buttonId: parsed.buttonId as number,
          voiceChannelId,
          displayName,
        });
      } else {
        result = await this.apiClient.autoChannelSubOption({
          guildId,
          userId,
          subOptionId: parsed.subOptionId as number,
          voiceChannelId,
          displayName,
        });
      }

      const content = resolveResultMessage(this.i18n, locale, result);
      if (result.action === 'show_sub_options' && result.subOptions) {
        const rows = this.buildSubOptionActionRows(
          result.subOptions,
          parsed.buttonId as number,
          result.nameInputMode ?? 'off',
        );
        await interaction.editReply({ content, components: rows });
      } else {
        await interaction.editReply({ content });
      }
    } catch (error) {
      this.logger.error(
        `[AUTO_CHANNEL] Interaction failed: customId=${interaction.customId}`,
        error instanceof Error ? error.stack : error,
      );

      try {
        const content = this.i18n.t(locale, 'errors.genericError');
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ ephemeral: true, content });
        } else {
          await interaction.reply({ ephemeral: true, content });
        }
      } catch {
        // 응답 실패 무시
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 방제 자유 입력 — 모달 진입(N3) / 제출(N1)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * mode=optional/required 버튼(또는 하위 선택지) 클릭 — showModal 전 N3 조회.
   * ⚠️ `deferReply()`를 절대 호출하지 않는다 — `showModal()`은 interaction의 첫 응답이어야 한다.
   */
  private async handleNameInputEntry(
    interaction: ButtonInteraction,
    parsed: ParsedAutoCustomId,
    { guildId, locale }: { guildId: string; locale: string },
  ): Promise<void> {
    try {
      const spec = await this.apiClient.autoChannelNameInput({
        buttonId: parsed.buttonId as number,
        subOptionId: parsed.kind === 'sub' ? parsed.subOptionId : undefined,
        locale: isSupportedLocale(locale) ? locale : undefined,
        guildId,
      });

      await interaction.showModal(this.buildNameInputModal(parsed, spec, locale));
    } catch (error) {
      // 타임아웃·404·400·5xx·네트워크 전부 동일 처리(D-9) — 채널 생성 없음, 기존 경로로 폴백하지 않는다
      // (required 정책이 조용히 무력화되는 것을 막는다). 3초 데드라인 안에 첫 응답을 보낸다.
      this.logger.error(
        `[AUTO_CHANNEL] name-input query failed: customId=${interaction.customId}`,
        error instanceof Error ? error.stack : error,
      );
      await this.safeReply(
        interaction,
        this.i18n.t(locale, 'voice.autoChannelNameInputUnavailable'),
      );
    }
  }

  /** `[다시 입력]` 버튼 — N3 재조회 후 `handleNameInputEntry`와 동일 경로로 재진입한다(F-VOICE-129). */
  private async handleRetryButton(interaction: ButtonInteraction): Promise<void> {
    const customId = interaction.customId;
    if (!interaction.guildId) return;

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const locale = await this.localeResolver.resolve(userId, guildId, interaction.locale);

    const parsed = this.parseRetryCustomId(customId);
    if (!parsed) {
      await this.safeReply(interaction, this.i18n.t(locale, 'errors.invalidRequest'));
      return;
    }

    await this.handleNameInputEntry(interaction, parsed, { guildId, locale });
  }

  private parseRetryCustomId(customId: string): ParsedAutoCustomId | null {
    const rest = customId.slice(CUSTOM_ID_PREFIX.RETRY.length);
    const segments = rest.split(':');

    if (segments[0] === 'btn') {
      const buttonId = parseInt(segments[1], 10);
      if (isNaN(buttonId)) return null;
      return { kind: 'button', buttonId, mode: 'optional' };
    }

    if (segments[0] === 'sub') {
      const subOptionId = parseInt(segments[1], 10);
      const buttonId = parseInt(segments[2], 10);
      if (isNaN(subOptionId) || isNaN(buttonId)) return null;
      return { kind: 'sub', subOptionId, buttonId, mode: 'optional' };
    }

    return null;
  }

  private buildNameInputModal(
    parsed: ParsedAutoCustomId,
    spec: AutoChannelNameInputSpec,
    locale: string,
  ): ModalBuilder {
    const customId =
      parsed.kind === 'button'
        ? `${CUSTOM_ID_PREFIX.MODAL_BUTTON}${parsed.buttonId}`
        : `${CUSTOM_ID_PREFIX.MODAL_SUB}${parsed.subOptionId}:${parsed.buttonId}`;

    const input = new TextInputBuilder()
      .setCustomId(NAME_INPUT_FIELD_ID)
      .setStyle(TextInputStyle.Short)
      .setLabel(this.i18n.t(locale, 'voice.autoChannelNameInputLabel'))
      .setPlaceholder(spec.placeholder)
      .setMaxLength(spec.maxLength)
      .setRequired(spec.mode === 'required');

    // 🔒 setMinLength()는 required일 때만 — optional에 걸면 Discord 클라이언트가 빈 입력을
    // 거부해 "비워도 됨" 계약이 깨진다.
    if (spec.mode === 'required') {
      input.setMinLength(spec.minLength);
    }

    return new ModalBuilder()
      .setCustomId(customId)
      .setTitle(this.i18n.t(locale, 'voice.autoChannelNameModalTitle'))
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  /**
   * 모달 제출 처리(N1) — `deferReply({ephemeral:true})` 후 서버 재검증 결과를 렌더한다.
   * `validation_error`에만 `[다시 입력]` 버튼을 붙인다.
   */
  private async handleModalSubmitInteraction(interaction: ModalSubmitInteraction): Promise<void> {
    const customId = interaction.customId;
    const isModalButton = customId.startsWith(CUSTOM_ID_PREFIX.MODAL_BUTTON);
    const isModalSub = customId.startsWith(CUSTOM_ID_PREFIX.MODAL_SUB);
    if (!isModalButton && !isModalSub) return;
    if (!interaction.guildId) return;

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    let buttonId: number;
    let subOptionId: number | undefined;

    if (isModalButton) {
      buttonId = parseInt(customId.slice(CUSTOM_ID_PREFIX.MODAL_BUTTON.length), 10);
    } else {
      const rest = customId.slice(CUSTOM_ID_PREFIX.MODAL_SUB.length);
      const [subPart, btnPart] = rest.split(':');
      subOptionId = parseInt(subPart, 10);
      buttonId = parseInt(btnPart, 10);
    }

    if (isNaN(buttonId) || (subOptionId !== undefined && isNaN(subOptionId))) {
      // customId 파싱 실패는 극히 드문 경로다 — 저장된 user locale 조회 왕복 없이
      // interaction.locale만으로 빠르게 응답한다(3초 데드라인 보호).
      const fallbackLocale = isSupportedLocale(interaction.locale)
        ? interaction.locale
        : DEFAULT_LOCALE;
      await this.safeReply(interaction, this.i18n.t(fallbackLocale, 'errors.invalidRequest'));
      return;
    }

    // 🔒 localeResolver.resolve()(user locale 조회 왕복)와 deferReply를 같은 try 안에 둬야
    // 10062(Unknown interaction) 등 실패가 아래 catch로 흘러 error 레벨로 기록된다
    // (handleLegacyClick과 동일 형태, EC-ACNI-38). resolve() 자체는 내부에서 예외를
    // 흡수해 절대 reject하지 않지만(LocaleResolverService 참조), deferReply는 인터랙션
    // 3초 데드라인을 넘기면 reject된다 — 이전엔 이 두 호출이 try 밖에 있어 그 실패가
    // 어디에도 잡히지 않았다(unhandled rejection).
    let locale: string = DEFAULT_LOCALE;

    try {
      locale = await this.localeResolver.resolve(userId, guildId, interaction.locale);
      await interaction.deferReply({ ephemeral: true });

      const guild = this.discord.guilds.cache.get(guildId);
      const voiceState = guild?.voiceStates.cache.get(userId);
      const voiceChannelId = voiceState?.channelId ?? null;
      const member = guild?.members.cache.get(userId);
      const displayName = member?.displayName ?? interaction.user.displayName;

      // 🔒 항상 `?? ''` — API DTO(userInput: @IsString())가 null을 거부한다.
      const userInput = interaction.fields.getTextInputValue(NAME_INPUT_FIELD_ID) ?? '';

      const result = await this.apiClient.autoChannelNameSubmit({
        guildId,
        userId,
        displayName,
        voiceChannelId,
        userInput,
        buttonId: isModalSub ? undefined : buttonId,
        subOptionId: isModalSub ? subOptionId : undefined,
      });

      const content = resolveResultMessage(this.i18n, locale, result);
      if (result.action === 'validation_error') {
        const retryRow = this.buildRetryButtonRow(locale, isModalSub, subOptionId, buttonId);
        await interaction.editReply({ content, components: [retryRow] });
      } else {
        await interaction.editReply({ content });
      }
    } catch (error) {
      // deferReply 이후 빈 로딩 방지(EC-ACNI-23·39, D-9)
      this.logger.error(
        `[AUTO_CHANNEL] name-submit failed: customId=${customId}`,
        error instanceof Error ? error.stack : error,
      );
      try {
        await interaction.editReply({
          content: this.i18n.t(locale, 'voice.autoChannelNameInputUnavailable'),
        });
      } catch {
        // 응답 실패 무시
      }
    }
  }

  private buildRetryButtonRow(
    locale: string,
    isModalSub: boolean,
    subOptionId: number | undefined,
    buttonId: number,
  ): ActionRowBuilder<ButtonBuilder> {
    const customId = isModalSub
      ? `${CUSTOM_ID_PREFIX.RETRY}sub:${subOptionId}:${buttonId}`
      : `${CUSTOM_ID_PREFIX.RETRY}btn:${buttonId}`;

    const button = new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(this.i18n.t(locale, 'voice.autoChannelNameRetryButton'))
      .setStyle(ButtonStyle.Secondary);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  }

  private async safeReply(interaction: RepliableInteraction, content: string): Promise<void> {
    try {
      await interaction.reply({ ephemeral: true, content });
    } catch {
      // 응답 실패 무시
    }
  }

  /**
   * 유니코드 이모지 또는 Discord 커스텀 이모지 형식인지 검증.
   */
  private isValidEmoji(value: string): boolean {
    if (/^<a?:\w+:\d+>$/.test(value)) return true;
    const codePoint = value.codePointAt(0) ?? 0;
    return codePoint > 127;
  }

  /**
   * API에서 반환된 하위 선택지 목록을 Discord ActionRow 컴포넌트 배열로 변환.
   * `mode`가 `'off'`가 아니면 customId에 `{buttonId}:{o|r}` 접미사를 실어(§3-1) N3가
   * 소속 버튼을 식별할 수 있게 한다.
   */
  private buildSubOptionActionRows(
    subOptions: Array<{ id: number; label: string; emoji: string | null }>,
    buttonId: number,
    mode: AutoChannelNameInputMode,
  ): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    for (let i = 0; i < subOptions.length; i += BUTTONS_PER_ROW) {
      const rowOptions = subOptions.slice(i, i + BUTTONS_PER_ROW);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        rowOptions.map((opt) => {
          const builder = new ButtonBuilder()
            .setCustomId(this.buildSubOptionCustomId(opt.id, buttonId, mode))
            .setLabel(opt.label)
            .setStyle(ButtonStyle.Primary);

          if (opt.emoji?.trim() && this.isValidEmoji(opt.emoji.trim())) {
            try {
              builder.setEmoji(opt.emoji.trim());
            } catch {
              // 유효하지 않은 이모지 무시
            }
          }

          return builder;
        }),
      );
      rows.push(row);
    }

    return rows;
  }

  private buildSubOptionCustomId(
    subOptionId: number,
    buttonId: number,
    mode: AutoChannelNameInputMode,
  ): string {
    if (mode === 'optional') return `${CUSTOM_ID_PREFIX.SUB_OPTION}${subOptionId}:${buttonId}:o`;
    if (mode === 'required') return `${CUSTOM_ID_PREFIX.SUB_OPTION}${subOptionId}:${buttonId}:r`;
    return `${CUSTOM_ID_PREFIX.SUB_OPTION}${subOptionId}`;
  }
}
