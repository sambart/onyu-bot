import { SlashCommandPipe } from '@discord-nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { parseLocale } from '@onyu/shared';
import { AttachmentBuilder, ChatInputCommandInteraction, GuildMember, type User } from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { respondWithErrorNotice } from '../../common/util/interaction-response.util';
import { CompatCommandDto } from './compat.dto';
import {
  COMPAT_USER_COOLDOWN_MS,
  getCompatUserCooldownRemainingMs,
  releaseCompatSlot,
  startCompatUserCooldown,
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

    // 실행자 단위 쿨다운만 둔다 — 채널 쿨다운은 여러 사용자의 동시 사용을 서로 막아 2026-11-12 제거(command-policy §3 예외). API 미호출.
    const userCooldownKey = `${guildId}:${interaction.user.id}`;
    const userRemainingMs = getCompatUserCooldownRemainingMs(userCooldownKey);
    if (userRemainingMs > 0) {
      await this.replyEphemeral(
        interaction,
        this.i18n.t(locale, 'commands.compatUserCooldown', {
          seconds: Math.ceil(userRemainingMs / MS_PER_SECOND),
        }),
      );
      return;
    }
    // 실행자 쿨다운은 게시 후에 시작하므로, 같은 실행자가 다른 채널에서 동시에 실행하면 위 확인을 함께 통과한다 — 실행자 슬롯으로 막는다.
    if (!tryAcquireCompatSlot(userCooldownKey)) {
      await this.replyEphemeral(
        interaction,
        this.i18n.t(locale, 'commands.compatUserCooldown', {
          seconds: Math.ceil(COMPAT_USER_COOLDOWN_MS / MS_PER_SECOND),
        }),
      );
      return;
    }

    try {
      await this.runCompat(interaction, guildId, locale, peerUser, userCooldownKey);
    } finally {
      releaseCompatSlot(userCooldownKey);
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
    userCooldownKey: string,
  ): Promise<void> {
    try {
      // 공개 defer — 원본 응답에 Discord 의 "OOO님이 /궁합 사용" 헤더가 붙어 실행자·커맨드가 드러난다.
      // 거부·오류는 rejectPrivately 가 공개 원본을 지우고 ephemeral 로 안내한다(EC-CP-118 ⓑ). 첫 응답도 try 안에 둔다.
      await interaction.deferReply();

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
        await this.rejectPrivately(interaction, this.i18n.t(locale, 'commands.compatError'));
        return;
      }

      const attachment = new AttachmentBuilder(Buffer.from(result.data.imageBase64, 'base64'), {
        name: COMPAT_ATTACHMENT_NAME,
      });
      const content = this.buildNextResetLine(locale, result.data.nextResetAt);
      await interaction.editReply(
        content === null ? { files: [attachment] } : { content, files: [attachment] },
      );
      startCompatUserCooldown(userCooldownKey);
    } catch (error) {
      await this.handleError(interaction, locale, error);
    }
  }

  /**
   * 카드 아래 "숫자 교체" 상대 시각 한 줄. 필드 부재(구버전 API)·파싱 실패면 null → content 생략.
   * Discord 타임스탬프 토큰은 번역 문자열이 아닌 파라미터로 주입한다(보는 사람 시간대로 렌더).
   */
  private buildNextResetLine(locale: string, nextResetAt: unknown): string | null {
    if (typeof nextResetAt !== 'string') {
      return null;
    }
    const ms = Date.parse(nextResetAt);
    if (!Number.isFinite(ms)) {
      return null;
    }
    return this.i18n.t(locale, 'commands.compatNextReset', {
      relative: `<t:${Math.floor(ms / MS_PER_SECOND)}:R>`,
    });
  }

  /**
   * 공개 defer 원본을 지우고 실행자에게만 안내한다 — 거부·오류(특히 상대 opt-out)가 채널에 남지 않게.
   * 삭제가 먼저다: 원본이 살아 있는 채 followUp 하면 그 followUp 이 defer 된 공개 원본을 대체할 수 있다.
   */
  private async rejectPrivately(
    interaction: ChatInputCommandInteraction,
    content: string,
  ): Promise<void> {
    if (!interaction.deferred) {
      // defer 자체가 실패한 경우 — 아직 응답이 없으니 ephemeral reply 로 안내한다
      await respondWithErrorNotice(interaction, content, this.logger);
      return;
    }
    try {
      await interaction.deleteReply();
    } catch (deleteError) {
      this.logger.warn(
        `Compat deleteReply failed: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`,
      );
    }
    try {
      await interaction.followUp({ content, ephemeral: true });
    } catch (followUpError) {
      this.logger.warn(
        `Compat private notice failed: ${followUpError instanceof Error ? followUpError.message : String(followUpError)}`,
      );
    }
  }

  private async handleError(
    interaction: ChatInputCommandInteraction,
    locale: string,
    error: unknown,
  ): Promise<void> {
    this.logger.error('Compat command error', error instanceof Error ? error.stack : String(error));
    await this.rejectPrivately(interaction, this.i18n.t(locale, 'commands.compatError'));
  }
}
