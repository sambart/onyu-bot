import { SlashCommandPipe } from '@discord-nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { CanvasCardLocale } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import { AttachmentBuilder, ChatInputCommandInteraction, GuildMember, type User } from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { RankCommandDto } from './rank.dto';

/** 아바타 이미지 해상도(px) — me.command.ts/best-friend.command.ts와 동일 규격 */
const AVATAR_SIZE = 128;

/** 조회 대상(본인/타인)의 표시명·아바타·userId 묶음 */
interface RankTarget {
  userId: string;
  displayName: string;
  avatarUrl: string;
}

@Command({
  name: 'rank',
  nameLocalizations: { ko: '랭크' },
  description: 'Show your or another member level rank card',
  descriptionLocalizations: { ko: '내 또는 다른 멤버의 레벨 랭크 카드를 보여줍니다' },
})
@Injectable()
export class RankCommand {
  private readonly logger = new Logger(RankCommand.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onRank(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    // SlashCommandPipe 바인딩 자체가 회귀 가드 목적이며 실제 값은 interaction.options로 읽는다
    // (best-friend.command.ts의 `_dto` 관례, F2 — base 이름 조회 불변식).
    @InteractionEvent(SlashCommandPipe) _dto: RankCommandDto,
  ): Promise<void> {
    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: this.i18n.t(locale, 'errors.guildOnly'),
        ephemeral: true,
      });
      return;
    }

    // F2 — base 이름(user)으로 조회한다. PRD·UF 본문의 getMember('유저')를 문자 그대로
    // 구현하면 항상 null이 되어 모든 타인 조회가 "비멤버"로 오분류된다(R4).
    const targetUser = interaction.options.getUser('user');
    const isSelf = !targetUser || targetUser.id === interaction.user.id;

    if (!isSelf) {
      // EC-RANK-10 1차 방어 — 봇 계정(API 미호출)
      if (targetUser.bot) {
        await interaction.reply({
          content: this.i18n.t(locale, 'commands.rankBotTarget'),
          ephemeral: true,
        });
        return;
      }

      // EC-RANK-11 1차 방어 — 서버 비멤버(API 미호출)
      if (!interaction.options.getMember('user')) {
        await interaction.reply({
          content: this.i18n.t(locale, 'commands.rankNonMember'),
          ephemeral: true,
        });
        return;
      }
    }

    // 공개 응답(비-ephemeral) 고정
    await interaction.deferReply();

    try {
      const target = this.resolveTarget(interaction, targetUser, isSelf);

      const result = await this.apiClient.getLevelRankCard({
        guildId,
        userId: target.userId,
        displayName: target.displayName,
        avatarUrl: target.avatarUrl,
        locale: this.toCanvasLocale(locale),
      });

      if (!result.ok) {
        await interaction.editReply({ content: this.i18n.t(locale, 'commands.rankError') });
        return;
      }

      if (!result.data) {
        const noDataKey = isSelf ? 'commands.rankNoData' : 'commands.rankNoDataOther';
        await interaction.editReply({ content: this.i18n.t(locale, noDataKey) });
        return;
      }

      const imageBuffer = Buffer.from(result.data.imageBase64, 'base64');
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'rank.png' });
      await interaction.editReply({ files: [attachment] });
    } catch (error) {
      this.logger.error('Rank command error', error instanceof Error ? error.stack : String(error));
      await interaction.editReply({ content: this.i18n.t(locale, 'commands.rankError') });
    }
  }

  /**
   * 조회 대상의 표시명·아바타를 산출한다. 본인·타인 모두 길드 닉네임(GuildMember.displayName)을
   * 우선한다 — duo 카드 PR#416 결함3 수리 근거와 동일 기준(전역 이름보다 길드 닉네임 우선).
   */
  private resolveTarget(
    interaction: ChatInputCommandInteraction,
    targetUser: User | null,
    isSelf: boolean,
  ): RankTarget {
    if (isSelf) {
      const displayName =
        (interaction.member as GuildMember)?.displayName ?? interaction.user.displayName;
      const avatarUrl = interaction.user.displayAvatarURL({
        extension: 'png',
        size: AVATAR_SIZE,
      });
      return { userId: interaction.user.id, displayName, avatarUrl };
    }

    // isSelf=false 분기는 targetUser가 non-null인 경우에만 진입한다(위 판정식 참조) — 안전한 단언
    const peer = targetUser as User;
    // GuildMember 캐스팅 — options.getMember()도 discord-nestjs 유니온(APIInteractionGuildMember |
    // GuildMember)을 반환한다(best-friend.command.ts 관례). null 가능성은 옵셔널 체이닝으로 처리한다.
    const peerMember = interaction.options.getMember('user') as GuildMember | null;
    const displayName = peerMember?.displayName ?? peer.displayName;
    const avatarUrl = peer.displayAvatarURL({ extension: 'png', size: AVATAR_SIZE });
    return { userId: peer.id, displayName, avatarUrl };
  }

  /** LocaleResolverService는 'ko' | 'en' 중 하나만 반환하므로 안전하게 캔버스 카드 로케일로 변환한다 */
  private toCanvasLocale(locale: string): CanvasCardLocale {
    return locale === 'ko' ? 'ko' : 'en';
  }
}
