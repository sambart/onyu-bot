import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import {
  type ButtonInteraction,
  DiscordAPIError,
  type GuildMember,
  Interaction,
  MessageFlags,
} from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { resolveResultMessage } from '../../common/application/message-code-map';

const CUSTOM_ID_PREFIX = {
  APPLY: 'status_prefix:',
  RESET: 'status_reset:',
} as const;

/** Discord REST API 에러 코드 — Missing Permissions */
const DISCORD_ERR_MISSING_PERMISSIONS = 50013;

/** member.setNickname() 시도 결과 — 권한 오류와 그 외 오류를 구분한다 */
type SetNicknameOutcome = 'ok' | 'no_permission' | 'other_error';

/**
 * Discord interactionCreate 이벤트를 수신하여 status_prefix/status_reset 버튼을 처리한다.
 * 비즈니스 로직은 API에 위임하고, 닉네임 변경과 Discord 응답은 Bot에서 직접 수행한다.
 */
@Injectable()
export class BotStatusPrefixInteractionHandler {
  private readonly logger = new Logger(BotStatusPrefixInteractionHandler.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @On('interactionCreate')
  async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    const isApply = customId.startsWith(CUSTOM_ID_PREFIX.APPLY);
    const isReset = customId.startsWith(CUSTOM_ID_PREFIX.RESET);
    if (!isApply && !isReset) return;
    if (!interaction.guildId) return;

    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    try {
      // API 왕복 + setNickname으로 3초 데드라인을 넘길 수 있으므로 즉시 defer한다.
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (isApply) {
        await this.handleApply(interaction, customId, locale);
      } else {
        await this.handleReset(interaction, locale);
      }
    } catch (error) {
      this.logger.error(
        `[STATUS_PREFIX] Interaction failed: customId=${customId}`,
        error instanceof Error ? error.stack : error,
      );
      await this.replyError(interaction, locale);
    }
  }

  private async handleApply(
    interaction: ButtonInteraction,
    customId: string,
    locale: string,
  ): Promise<void> {
    const buttonId = parseInt(customId.slice(CUSTOM_ID_PREFIX.APPLY.length), 10);
    if (isNaN(buttonId)) {
      await interaction.editReply({ content: this.i18n.t(locale, 'errors.invalidRequest') });
      return;
    }

    const guildId = interaction.guildId ?? '';
    const memberId = interaction.user.id;
    const member = interaction.member as GuildMember;

    const result = await this.apiClient.applyStatusPrefix({
      guildId,
      memberId,
      buttonId,
      currentDisplayName: member.displayName,
    });

    if (result.success && result.newNickname) {
      const outcome = await this.setNickname(member, result.newNickname);
      if (outcome !== 'ok') {
        // API 측엔 이미 원본 닉네임이 저장됐으므로, Discord 반영 실패 시 롤백하지 않으면
        // 실제로는 적용되지 않았는데 "적용됨" 상태로 남는다(fire-and-forget).
        this.rollbackApply(guildId, memberId);
        await interaction.editReply({
          content: this.i18n.t(
            locale,
            outcome === 'no_permission' ? 'errors.nicknamePermission' : 'errors.genericError',
          ),
        });
        return;
      }
    }

    await interaction.editReply({ content: resolveResultMessage(this.i18n, locale, result) });
  }

  private async handleReset(interaction: ButtonInteraction, locale: string): Promise<void> {
    const guildId = interaction.guildId ?? '';
    const memberId = interaction.user.id;
    const member = interaction.member as GuildMember;

    const result = await this.apiClient.resetStatusPrefix({ guildId, memberId });

    if (result.success && result.originalNickname) {
      const outcome = await this.setNickname(member, result.originalNickname);
      if (outcome !== 'ok') {
        await interaction.editReply({
          content: this.i18n.t(
            locale,
            outcome === 'no_permission' ? 'errors.nicknamePermission' : 'errors.genericError',
          ),
        });
        return;
      }
    }

    await interaction.editReply({ content: resolveResultMessage(this.i18n, locale, result) });
  }

  /**
   * 닉네임 변경 시도 결과를 세분화하여 반환한다.
   * 50013(Missing Permissions)만 권한 오류로 취급하고, 그 외 실패는 일반 오류로 구분한다.
   */
  private async setNickname(member: GuildMember, nickname: string): Promise<SetNicknameOutcome> {
    try {
      await member.setNickname(nickname);
      return 'ok';
    } catch (error) {
      if (error instanceof DiscordAPIError && error.code === DISCORD_ERR_MISSING_PERMISSIONS) {
        return 'no_permission';
      }
      return 'other_error';
    }
  }

  /**
   * 닉네임 적용 실패 시 API에 저장된 원본 닉네임 Redis 키를 롤백(삭제)한다.
   * 실패를 흡수하고 로그만 남긴다 — 롤백 실패는 다음 클릭 시 자연 복구된다.
   */
  private rollbackApply(guildId: string, memberId: string): void {
    this.apiClient.resetStatusPrefix({ guildId, memberId }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[STATUS_PREFIX] rollback failed: guild=${guildId} member=${memberId} - ${message}`,
      );
    });
  }

  private async replyError(interaction: ButtonInteraction, locale: string): Promise<void> {
    const content = this.i18n.t(locale, 'errors.genericError');
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content });
      } else {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content });
      }
    } catch {
      // Discord 응답 자체가 실패한 경우 무시
    }
  }
}
