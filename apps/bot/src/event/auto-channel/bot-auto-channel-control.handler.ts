import { InjectDiscordClient, On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { AutoChannelControlResult } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import {
  AUTO_CHANNEL_CONTROL_ACTION,
  AUTO_CHANNEL_CONTROL_BUTTON_PREFIX,
  AUTO_CHANNEL_CONTROL_LIMIT_INPUT_ID,
  AUTO_CHANNEL_CONTROL_MEMBER_IDS_MAX,
  AUTO_CHANNEL_CONTROL_MODAL_PREFIX,
  AUTO_CHANNEL_USER_LIMIT_MAX,
  AUTO_CHANNEL_USER_LIMIT_MIN,
  type AutoChannelControlAction,
  buildAutoChannelControlLimitModalId,
  DEFAULT_LOCALE,
  MESSAGE_CODE,
} from '@onyu/shared';
import type { ButtonInteraction, Interaction, ModalSubmitInteraction } from 'discord.js';
import {
  ActionRowBuilder,
  Client,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { resolveResultMessage } from '../../common/application/message-code-map';

/** Discord 채널 ID(snowflake) 형식 — EC-ACNI-68. */
const CHANNEL_ID_PATTERN = /^\d{17,20}$/;

/** 정원 입력 최대 글자수(0~99 = 2자리). */
const LIMIT_INPUT_MAX_LENGTH = String(AUTO_CHANNEL_USER_LIMIT_MAX).length;

/** 모달 제출 customId 의 액션 세그먼트 접두 — `auto_ctl_modal:limit:` */
const LIMIT_MODAL_ACTION_PREFIX = `${AUTO_CHANNEL_CONTROL_MODAL_PREFIX}${AUTO_CHANNEL_CONTROL_ACTION.LIMIT}:`;

interface ParsedControlButton {
  action: AutoChannelControlAction;
  channelId: string;
}

/**
 * 생성자 제어 패널(F-VOICE-149) — `auto_ctl:{limit|lock|unlock}:{channelId}` 버튼과
 * `auto_ctl_modal:limit:{channelId}` 정원 모달을 받아 API bot-api(AC3·AC4·AC5)로 중계한다.
 * 권한·상태 판정은 전부 API 몫이고, 봇은 Discord 응답(showModal/deferReply/editReply)만 맡는다.
 * 기존 `BotAutoChannelInteractionHandler`(auto_btn/auto_sub/auto_name_*)와 customId 접두가 겹치지 않는다.
 */
@Injectable()
export class BotAutoChannelControlHandler {
  private readonly logger = new Logger(BotAutoChannelControlHandler.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    @InjectDiscordClient() private readonly discord: Client,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @On('interactionCreate')
  async handle(interaction: Interaction): Promise<void> {
    if (interaction.isButton()) {
      if (!interaction.customId.startsWith(AUTO_CHANNEL_CONTROL_BUTTON_PREFIX)) return;
      await this.handleButton(interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      if (!interaction.customId.startsWith(LIMIT_MODAL_ACTION_PREFIX)) return;
      await this.handleLimitModalSubmit(interaction);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 버튼 클릭
  // ─────────────────────────────────────────────────────────────────────────

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guildId) return;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    // locale 조회(캐시 미스 시 API 최대 1초)를 먼저 시작만 해 두고, [정원 변경]은 AC3 사전 판정(최대 1.5초)과
    // 겹쳐 기다린다 — 순차로 기다리면 둘의 합이 첫 응답(showModal) 3초 데드라인을 잠식한다.
    const localePromise = this.localeResolver.resolve(userId, guildId, interaction.locale);

    const parsed = this.parseButtonCustomId(interaction.customId);
    if (parsed?.channelId !== interaction.channelId) {
      await this.safeReply(interaction, this.i18n.t(await localePromise, 'errors.invalidRequest'));
      return;
    }

    const voiceChannelId = this.getVoiceChannelId(guildId, userId);

    if (parsed.action === AUTO_CHANNEL_CONTROL_ACTION.LIMIT) {
      await this.handleLimitEntry(interaction, { guildId, voiceChannelId }, parsed, localePromise);
      return;
    }

    const locale = await localePromise;
    await this.handleLockToggle(interaction, { guildId, locale, voiceChannelId }, parsed);
  }

  /**
   * [정원 변경] — AC3 사전 판정 후 모달.
   * deferReply 를 호출하지 않는다 — `showModal()` 은 interaction 의 첫 응답이어야 한다.
   */
  private async handleLimitEntry(
    interaction: ButtonInteraction,
    base: { guildId: string; voiceChannelId: string | null },
    parsed: ParsedControlButton,
    localePromise: Promise<string>,
  ): Promise<void> {
    const checkPromise = this.apiClient.autoChannelControlCheck({
      guildId: base.guildId,
      userId: interaction.user.id,
      channelId: parsed.channelId,
      voiceChannelId: base.voiceChannelId,
    });
    // locale await 가 먼저 끝나기 전에 check 가 reject 되면 unhandled 가 되므로 여기서 표시만 해 둔다 — 실제 처리는 아래 try
    checkPromise.catch(() => undefined);
    const locale = await localePromise;

    try {
      const check = await checkPromise;

      // `in` 판별: strictNullChecks 꺼진 설정에서 boolean 리터럴 판별식은 좁혀지지 않는다.
      if (!('state' in check)) {
        await this.safeReply(interaction, resolveResultMessage(this.i18n, locale, check));
        return;
      }

      await interaction.showModal(
        this.buildLimitModal(parsed.channelId, locale, check.state.userLimit),
      );
    } catch (error) {
      // 타임아웃·5xx·네트워크 전부 동일 처리 — 모달 폴백 없음(EC-ACNI-92). 3초 안에 첫 응답을 보낸다.
      this.logger.error(
        `[AUTO_CHANNEL_CONTROL] check failed: customId=${interaction.customId}`,
        error instanceof Error ? error.stack : error,
      );
      await this.safeReply(interaction, this.i18n.t(locale, 'voice.autoChannelControlUnavailable'));
    }
  }

  /** [잠금]/[잠금 해제] — deferReply 후 AC5. 멤버 목록은 잠금 시에만 보낸다(해제는 `[]`). */
  private async handleLockToggle(
    interaction: ButtonInteraction,
    ctx: { guildId: string; locale: string; voiceChannelId: string | null },
    parsed: ParsedControlButton,
  ): Promise<void> {
    const isLock = parsed.action === AUTO_CHANNEL_CONTROL_ACTION.LOCK;
    try {
      await interaction.deferReply({ ephemeral: true });

      const result = await this.apiClient.autoChannelControlLock({
        guildId: ctx.guildId,
        userId: interaction.user.id,
        channelId: parsed.channelId,
        voiceChannelId: ctx.voiceChannelId,
        locked: isLock,
        channelMemberIds: isLock
          ? this.collectChannelMemberIds(ctx.guildId, parsed.channelId, interaction.user.id)
          : [],
        panelMessageId: interaction.message.id,
      });

      await interaction.editReply({ content: this.renderResult(ctx.locale, result) });
    } catch (error) {
      this.logger.error(
        `[AUTO_CHANNEL_CONTROL] lock failed: customId=${interaction.customId}`,
        error instanceof Error ? error.stack : error,
      );
      await this.safeEditFallback(interaction, ctx.locale);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 정원 모달 제출
  // ─────────────────────────────────────────────────────────────────────────

  private async handleLimitModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.guildId) return;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const channelId = interaction.customId.slice(LIMIT_MODAL_ACTION_PREFIX.length);

    // locale 해석(왕복)과 deferReply 를 같은 try 안에 둬 실패가 catch 로 흐르게 한다
    // (방제 모달 제출과 동일 형태).
    let locale: string = DEFAULT_LOCALE;
    try {
      locale = await this.localeResolver.resolve(userId, guildId, interaction.locale);

      if (!CHANNEL_ID_PATTERN.test(channelId) || channelId !== interaction.channelId) {
        await interaction.reply({
          ephemeral: true,
          content: this.i18n.t(locale, 'errors.invalidRequest'),
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      // 🔒 항상 `?? ''` — API DTO(userLimitInput: @IsString())가 null 을 거부한다.
      const userLimitInput =
        interaction.fields.getTextInputValue(AUTO_CHANNEL_CONTROL_LIMIT_INPUT_ID) ?? '';

      const result = await this.apiClient.autoChannelControlUserLimit({
        guildId,
        userId,
        channelId,
        voiceChannelId: this.getVoiceChannelId(guildId, userId),
        userLimitInput,
      });

      await interaction.editReply({ content: this.renderResult(locale, result) });
    } catch (error) {
      // deferReply 이후 빈 로딩 방치 금지(EC-ACNI-67)
      this.logger.error(
        `[AUTO_CHANNEL_CONTROL] user-limit failed: customId=${interaction.customId}`,
        error instanceof Error ? error.stack : error,
      );
      await this.safeEditFallback(interaction, locale);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 보조
  // ─────────────────────────────────────────────────────────────────────────

  /** `auto_ctl:{action}:{channelId}` 파싱. 알 수 없는 액션·형식 오류면 null. */
  private parseButtonCustomId(customId: string): ParsedControlButton | null {
    const [action, channelId, ...rest] = customId
      .slice(AUTO_CHANNEL_CONTROL_BUTTON_PREFIX.length)
      .split(':');
    if (rest.length > 0 || !channelId || !CHANNEL_ID_PATTERN.test(channelId)) return null;

    const knownActions: string[] = Object.values(AUTO_CHANNEL_CONTROL_ACTION);
    if (!knownActions.includes(action)) return null;

    // as 단언 사유: knownActions 포함 여부로 AutoChannelControlAction 임을 위에서 확인했다.
    return { action: action as AutoChannelControlAction, channelId };
  }

  /** 클릭자의 현재 음성 채널 — Gateway 캐시 출처(REST 에는 voice 정보가 없다). */
  private getVoiceChannelId(guildId: string, userId: string): string | null {
    const guild = this.discord.guilds.cache.get(guildId);
    return guild?.voiceStates.cache.get(userId)?.channelId ?? null;
  }

  /** 대상 채널 멤버 ID — 클릭자 먼저 + 중복 제거 + 앞 100명(P5). */
  private collectChannelMemberIds(guildId: string, channelId: string, clickerId: string): string[] {
    const channel = this.discord.guilds.cache.get(guildId)?.channels.cache.get(channelId);
    const memberIds = channel?.isVoiceBased() ? [...channel.members.keys()] : [];
    return [...new Set([clickerId, ...memberIds])].slice(0, AUTO_CHANNEL_CONTROL_MEMBER_IDS_MAX);
  }

  private buildLimitModal(channelId: string, locale: string, currentLimit?: number): ModalBuilder {
    const input = new TextInputBuilder()
      .setCustomId(AUTO_CHANNEL_CONTROL_LIMIT_INPUT_ID)
      .setStyle(TextInputStyle.Short)
      .setLabel(this.i18n.t(locale, 'voice.autoChannelControlLimitInputLabel'))
      .setPlaceholder(this.i18n.t(locale, 'voice.autoChannelControlLimitInputPlaceholder'))
      .setMaxLength(LIMIT_INPUT_MAX_LENGTH)
      .setRequired(true);

    if (currentLimit !== undefined) {
      input.setValue(String(currentLimit));
    }

    return new ModalBuilder()
      .setCustomId(buildAutoChannelControlLimitModalId(channelId))
      .setTitle(this.i18n.t(locale, 'voice.autoChannelControlLimitModalTitle'))
      .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  private renderResult(locale: string, result: AutoChannelControlResult): string {
    // 0 = 제한 없음 — "0명으로 바꿨어요" 대신 해제 문구를 쓴다.
    if (
      result.code === MESSAGE_CODE.AUTO_CHANNEL_CONTROL_LIMIT_UPDATED &&
      Number(result.params?.userLimit) === AUTO_CHANNEL_USER_LIMIT_MIN
    ) {
      return this.i18n.t(locale, 'voice.autoChannelControlLimitUnlimited');
    }
    return resolveResultMessage(this.i18n, locale, result);
  }

  private async safeReply(
    interaction: ButtonInteraction | ModalSubmitInteraction,
    content: string,
  ): Promise<void> {
    try {
      await interaction.reply({ ephemeral: true, content });
    } catch {
      // 응답 실패 무시
    }
  }

  /** deferReply 이후 예외 시 폴백 문구로 editReply — 실패해도 무시. */
  private async safeEditFallback(
    interaction: ButtonInteraction | ModalSubmitInteraction,
    locale: string,
  ): Promise<void> {
    try {
      await interaction.editReply({
        content: this.i18n.t(locale, 'voice.autoChannelControlFailed'),
      });
    } catch {
      // 응답 실패 무시
    }
  }
}
