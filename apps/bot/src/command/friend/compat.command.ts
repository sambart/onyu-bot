import { SlashCommandPipe } from '@discord-nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService, isDuoPeerHiddenError } from '@onyu/bot-api-client';
import { parseLocale } from '@onyu/shared';
import { AttachmentBuilder, ChatInputCommandInteraction, GuildMember, type User } from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { respondWithErrorNotice } from '../../common/util/interaction-response.util';
import { CompatCommandDto } from './compat.dto';
import {
  COMPAT_COOLDOWN_MS,
  getCompatCooldownRemainingMs,
  releaseCompatSlot,
  startCompatCooldown,
  tryAcquireCompatSlot,
} from './compat-cooldown';

const MS_PER_SECOND = 1000;
const COMPAT_ATTACHMENT_NAME = 'compat.png';
const AVATAR_SIZE = 128;

@Command({
  name: 'ship',
  nameLocalizations: { ko: '궁합' },
  description: "Check today's random ship score with a member",
  descriptionLocalizations: {
    ko: '멤버와 오늘의 랜덤 궁합을 카드로 보여줍니다',
    'pt-BR': 'Mostra o cartão de match aleatório do dia com um membro',
    ja: 'メンバーとの今日のランダム相性占いをカードで表示',
  },
})
@Injectable()
export class CompatCommand {
  private readonly logger = new Logger(CompatCommand.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onCompat(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    // SlashCommandPipe 바인딩은 옵션 메타데이터 일관성용 — 실제 값은 interaction.options 로 읽는다.
    @InteractionEvent(SlashCommandPipe) _dto: CompatCommandDto,
  ): Promise<void> {
    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    const guildId = interaction.guildId;
    if (!guildId) {
      await this.replyEphemeral(interaction, this.i18n.t(locale, 'errors.guildOnly'));
      return;
    }

    const peerUser = interaction.options.getUser('peer', true);
    const rejection = this.checkPeerEligibility(interaction, peerUser, locale);
    if (rejection) {
      await this.replyEphemeral(interaction, rejection);
      return;
    }

    const cooldownKey = `${guildId}:${interaction.channelId}`;
    const remainingMs = getCompatCooldownRemainingMs(cooldownKey);
    if (remainingMs > 0) {
      await this.replyCooldown(interaction, locale, remainingMs);
      return;
    }
    // 쿨다운은 게시 후에 시작하므로, 같은 채널의 다른 실행이 진행 중이면 곧 시작될 쿨다운 전체로 안내한다.
    if (!tryAcquireCompatSlot(cooldownKey)) {
      await this.replyCooldown(interaction, locale, COMPAT_COOLDOWN_MS);
      return;
    }

    try {
      await this.runCompat(interaction, guildId, locale, peerUser, cooldownKey);
    } finally {
      releaseCompatSlot(cooldownKey);
    }
  }

  /** 1차 판정(API 미호출) — 거부 문구를 반환, 통과면 null. 본인 지정은 거부하지 않는다. */
  private checkPeerEligibility(
    interaction: ChatInputCommandInteraction,
    peerUser: User,
    locale: string,
  ): string | null {
    if (peerUser.bot) {
      return this.i18n.t(locale, 'commands.compatBotTarget');
    }
    const isSelf = peerUser.id === interaction.user.id;
    if (!isSelf && !interaction.options.getMember('peer')) {
      return this.i18n.t(locale, 'commands.compatNonMember');
    }
    return null;
  }

  private async replyCooldown(
    interaction: ChatInputCommandInteraction,
    locale: string,
    remainingMs: number,
  ): Promise<void> {
    const seconds = Math.ceil(remainingMs / MS_PER_SECOND);
    await this.replyEphemeral(
      interaction,
      this.i18n.t(locale, 'commands.compatCooldown', { seconds }),
    );
  }

  private async replyEphemeral(
    interaction: ChatInputCommandInteraction,
    content: string,
  ): Promise<void> {
    await interaction.reply({ content, ephemeral: true });
  }

  private async runCompat(
    interaction: ChatInputCommandInteraction,
    guildId: string,
    locale: string,
    peerUser: User,
    cooldownKey: string,
  ): Promise<void> {
    try {
      // 거부·오류 안내가 채널에 새지 않도록 ephemeral 로 시작한다. 첫 응답도 try 안에 둔다.
      await interaction.deferReply({ ephemeral: true });

      // GuildMember 캐스팅 — discord-nestjs 의 member 는 APIInteractionGuildMember | GuildMember 유니온
      const selfDisplayName =
        (interaction.member as GuildMember)?.displayName ?? interaction.user.displayName;
      const isSelf = peerUser.id === interaction.user.id;
      // 닉네임 기준을 길드 닉네임으로 통일 — 캐시 키에 실행자 정보가 없으므로 누가 실행해도 같은 이미지여야 한다.
      // getMember 도 유니온 반환이라 캐스팅한다.
      const peerMember = interaction.options.getMember('peer') as GuildMember | null;
      const peerDisplayName = isSelf
        ? selfDisplayName
        : (peerMember?.displayName ?? peerUser.displayName);

      const result = await this.apiClient.getCompatCard({
        guildId,
        // 🔒 userId 는 언제나 실행자. 상대는 peerId 로만 전달한다(본인 지정이면 두 값이 같다).
        userId: interaction.user.id,
        peerId: peerUser.id,
        selfDisplayName,
        selfAvatarUrl: interaction.user.displayAvatarURL({ extension: 'png', size: AVATAR_SIZE }),
        peerDisplayName,
        peerAvatarUrl: peerUser.displayAvatarURL({ extension: 'png', size: AVATAR_SIZE }),
        locale: parseLocale(locale),
      });

      if (!result.ok || !result.data) {
        // 텍스트 폴백 없음(V5) — 고지 없는 점수 노출 방지
        await interaction.editReply({ content: this.i18n.t(locale, 'commands.compatError') });
        return;
      }

      await this.postPublicCard(interaction, locale, result.data.imageBase64, cooldownKey);
    } catch (error) {
      await this.handleError(interaction, locale, error);
    }
  }

  /** editReply 로 원본을 확정 → 공개 followUp → 쿨다운 시작 → 원본(ephemeral) 삭제. */
  private async postPublicCard(
    interaction: ChatInputCommandInteraction,
    locale: string,
    imageBase64: string,
    cooldownKey: string,
  ): Promise<void> {
    const attachment = new AttachmentBuilder(Buffer.from(imageBase64, 'base64'), {
      name: COMPAT_ATTACHMENT_NAME,
    });

    await interaction.editReply({ content: this.i18n.t(locale, 'commands.compatPosted') });
    await interaction.followUp({ ephemeral: false, files: [attachment] });
    startCompatCooldown(cooldownKey);

    try {
      await interaction.deleteReply();
    } catch (deleteError) {
      this.logger.warn(
        `Compat deleteReply failed: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`,
      );
    }
  }

  private async handleError(
    interaction: ChatInputCommandInteraction,
    locale: string,
    error: unknown,
  ): Promise<void> {
    // 상대가 관계 표시를 거부한 정상 흐름(EC-CP-112) — 오류 로그 없이 단정하지 않는 안내만
    if (isDuoPeerHiddenError(error)) {
      this.logger.debug('Compat peer hidden');
      await interaction.editReply({
        content: this.i18n.t(locale, 'commands.compatPeerHidden'),
        components: [],
      });
      return;
    }
    this.logger.error('Compat command error', error instanceof Error ? error.stack : String(error));
    await respondWithErrorNotice(
      interaction,
      this.i18n.t(locale, 'commands.compatError'),
      this.logger,
    );
  }
}
