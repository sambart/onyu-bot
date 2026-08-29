import { SlashCommandPipe } from '@discord-nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type {
  BestFriendCardResponse,
  CanvasCardLocale,
  DuoChemistryCardResponse,
} from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  GuildMember,
  type User,
} from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { BestFriendCommandDto } from './best-friend.dto';

// 집계 기간 (일) — 90일 고정.
// 2026-08-07 리뷰 D1 사용자 결정: 30일 → 90일 고정 확대(옵션 파라미터 재도입 아님 — simplify 결정 유지)
// getMyBestFriends period 파라미터가 7 | 30 | 90 리터럴 유니온이므로 as const 필수
const PERIOD = 90 as const;
// TOP N — 5명 고정
const LIMIT = 5;
// 대시보드 기본 URL (WEB_URL 미설정 시 prod 도메인)
const DEFAULT_WEB_URL = 'https://onyu.dev';

/**
 * [🔗 채널에 공개하기] 버튼 customId 접두어(F-COPRESENCE-029, 계획 §2-B) —
 * `bot-duo-chemistry-interaction.handler.ts`와 공유. 형태: `friend:duo:publish:{peerId}`.
 */
const DUO_PUBLISH_CUSTOM_ID_PREFIX = 'friend:duo:publish:';

@Command({
  name: 'best-friend',
  nameLocalizations: { ko: '친한친구' },
  description: 'Show my best friend TOP card',
  descriptionLocalizations: { ko: '내 베스트 프렌드 TOP을 카드로 보여줍니다' },
})
@Injectable()
export class BestFriendCommand {
  private readonly logger = new Logger(BestFriendCommand.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onBestFriend(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    // SlashCommandPipe 바인딩 자체가 회귀 가드(R2, "무옵션 호출 시 dto.peer===undefined") 목적이며
    // 실제 값은 interaction.options로 읽는다(sticky-message-delete.command.ts의 `_dto` 관례).
    @InteractionEvent(SlashCommandPipe) _dto: BestFriendCommandDto,
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

    const peerUser = interaction.options.getUser('peer');

    // 상대 미지정 또는 본인 지정(D-6) → 기존 개인 TOP5 카드 경로. 완전 불변(F-COPRESENCE-014).
    if (!peerUser || peerUser.id === interaction.user.id) {
      await this.runPersonalCard(interaction, guildId, locale);
      return;
    }

    // EC-CP-46 1차 방어 — API 미호출
    if (peerUser.bot) {
      await interaction.reply({
        content: this.i18n.t(locale, 'commands.bestFriendDuoBotTarget'),
        ephemeral: true,
      });
      return;
    }

    // EC-CP-48 1차 방어 — 현재 서버 멤버가 아니면 API 미호출
    if (!interaction.options.getMember('peer')) {
      await interaction.reply({
        content: this.i18n.t(locale, 'commands.bestFriendDuoNonMember'),
        ephemeral: true,
      });
      return;
    }

    await this.runDuoCard(interaction, guildId, locale, peerUser);
  }

  // ── 무옵션 경로 — 기존 개인 TOP5 카드(F-COPRESENCE-014, 완전 불변) ──────────────

  private async runPersonalCard(
    interaction: ChatInputCommandInteraction,
    guildId: string,
    locale: string,
  ): Promise<void> {
    // 공개 응답 고정 (ephemeral 없음)
    await interaction.deferReply();

    // guildId·locale은 함수 인자로 catch 시점에도 항상 확정돼 있으므로 try 밖에서 미리 생성한다.
    // catch 경로(C2 결함 수정)에서도 정상 실패 경로와 동일하게 웹 링크 버튼을 노출하기 위함.
    // buildLinkButtonRow 자체는 이론상 던지지 않지만(guildId는 항상 유효한 snowflake, webUrl은
    // 상수/env, i18n.t는 실패 시 key를 폴백 반환) try 밖에서 실행되므로 방어적으로 감싼다 —
    // 여기서 던지면 catch가 없어 핸들러 전체가 unhandled로 터진다.
    let linkButtonRow: ActionRowBuilder<ButtonBuilder> | null;
    try {
      linkButtonRow = this.buildLinkButtonRow(guildId, locale);
    } catch (buildError) {
      this.logger.error(
        'BestFriend link button build failed',
        buildError instanceof Error ? buildError.stack : String(buildError),
      );
      linkButtonRow = null;
    }

    try {
      // GuildMember 캐스팅 — discord-nestjs CommandInteraction.member는 APIInteractionGuildMember | GuildMember 유니온
      const displayName =
        (interaction.member as GuildMember)?.displayName ?? interaction.user.displayName;
      const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });

      const result = await this.apiClient.getMyBestFriends({
        guildId,
        userId: interaction.user.id,
        displayName,
        avatarUrl,
        period: PERIOD,
        limit: LIMIT,
        locale: this.toCanvasLocale(locale),
      });

      if (!result.ok) {
        await interaction.editReply({
          content: this.i18n.t(locale, 'commands.bestFriendError'),
          components: this.toButtonComponents(linkButtonRow),
        });
        return;
      }

      if (!result.data) {
        await interaction.editReply({
          content: this.i18n.t(locale, 'commands.bestFriendNoData', { days: result.days }),
          components: this.toButtonComponents(linkButtonRow),
        });
        return;
      }

      await this.renderPersonalCard(interaction, result, linkButtonRow);
    } catch (error) {
      this.logger.error(
        'BestFriend command error',
        error instanceof Error ? error.stack : String(error),
      );
      await interaction.editReply({
        content: this.i18n.t(locale, 'commands.bestFriendError'),
        components: this.toButtonComponents(linkButtonRow),
      });
    }
  }

  /** LocaleResolverService는 'ko' | 'en' 중 하나만 반환하므로 안전하게 캔버스 카드 로케일로 변환한다 */
  private toCanvasLocale(locale: string): CanvasCardLocale {
    return locale === 'ko' ? 'ko' : 'en';
  }

  private buildLinkButtonRow(guildId: string, locale: string): ActionRowBuilder<ButtonBuilder> {
    // WEB_URL은 런타임에 읽는다 — 모듈 import 시점에 평가하면 ConfigModule의 .env 로드 전이라 fallback이 굳을 수 있다
    const webUrl = process.env['WEB_URL'] ?? DEFAULT_WEB_URL;
    // days=PERIOD — 카드(90일 고정) ↔ 마이페이지 진입 뷰 기간 정합 (F-COPRESENCE-019 화이트리스트 7|30|90)
    const button = new ButtonBuilder()
      .setLabel(this.i18n.t(locale, 'commands.bestFriendButtonLabel'))
      .setStyle(ButtonStyle.Link)
      .setURL(`${webUrl}/my/friends?guildId=${guildId}&days=${PERIOD}`);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  }

  /** buildLinkButtonRow 실패(방어적 try/catch, null) 시 버튼 없이 진행하기 위한 변환 헬퍼 */
  private toButtonComponents(
    linkButtonRow: ActionRowBuilder<ButtonBuilder> | null,
  ): ActionRowBuilder<ButtonBuilder>[] {
    return linkButtonRow ? [linkButtonRow] : [];
  }

  private async renderPersonalCard(
    interaction: ChatInputCommandInteraction,
    result: BestFriendCardResponse,
    linkButtonRow: ActionRowBuilder<ButtonBuilder> | null,
  ): Promise<void> {
    if (!result.data) {
      return;
    }
    const imageBuffer = Buffer.from(result.data.imageBase64, 'base64');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'best-friends.png' });

    await interaction.editReply({
      files: [attachment],
      components: this.toButtonComponents(linkButtonRow),
    });
  }

  // ── `상대` 지정 경로 — 듀오 케미 카드(F-COPRESENCE-029, D-5) ────────────────────

  private async runDuoCard(
    interaction: ChatInputCommandInteraction,
    guildId: string,
    locale: string,
    peerUser: User,
  ): Promise<void> {
    // ephemeral 고정 + [🔗 채널에 공개하기] 버튼으로 본인 선택 공개(D-3·D-5)
    await interaction.deferReply({ ephemeral: true });

    try {
      // GuildMember 캐스팅 — discord-nestjs CommandInteraction.member는 APIInteractionGuildMember | GuildMember 유니온
      const displayName =
        (interaction.member as GuildMember)?.displayName ?? interaction.user.displayName;
      const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });
      const peerAvatarUrl = peerUser.displayAvatarURL({ extension: 'png', size: 128 });
      // PR#416 리뷰 결함3 수정 — peerUser.displayName(전역 이름) 대신 EC-CP-48 1차 방어에서
      // 이미 확보한 GuildMember의 길드 닉네임을 사용한다. 캐시 키(guildId+정렬된 페어ID+locale)에
      // 실행자 정보가 없어 먼저 실행한 쪽의 이름 조합으로 5분간 캐시되므로, self/peer 모두
      // 같은 기준(길드 닉네임)이어야 "누가 실행해도 같은 이미지"가 성립한다
      // (duo-chemistry-card.types.ts 캐시 설계 전제).
      // GuildMember 캐스팅 — options.getMember()도 discord-nestjs 유니온(APIInteractionGuildMember |
      // GuildMember)을 반환한다. null 가능성은 옵셔널 체이닝(peerMember?.displayName)으로 처리한다.
      const peerMember = interaction.options.getMember('peer') as GuildMember | null;
      const peerDisplayName = peerMember?.displayName ?? peerUser.displayName;

      const result = await this.apiClient.getDuoChemistry({
        guildId,
        // 🔒 §2-F 불변식 — userId는 언제나 실행자다. peerUser.id는 절대 여기 들어가지 않는다.
        userId: interaction.user.id,
        peerId: peerUser.id,
        selfDisplayName: displayName,
        selfAvatarUrl: avatarUrl,
        peerDisplayName,
        peerAvatarUrl,
        locale: this.toCanvasLocale(locale),
      });

      if (!result.ok || !result.data) {
        await interaction.editReply({
          content: this.i18n.t(locale, 'commands.bestFriendDuoError'),
        });
        return;
      }

      await this.renderDuoCard(interaction, result, peerUser.id, locale);
    } catch (error) {
      this.logger.error(
        'BestFriend duo command error',
        error instanceof Error ? error.stack : String(error),
      );
      // 1차 방어(봇/self/비멤버)를 이미 통과한 뒤라 이 catch에 도달하는 원인은 대부분 네트워크·
      // 렌더 실패다. API 2차 방어(EC-CP-48, 탈퇴자 DB 정합 지연 등 드문 경합)로 400이 와도
      // 동일한 일반 오류 문구로 안내한다 — 네트워크 오류를 "비멤버"로 오분류하지 않기 위함.
      await interaction.editReply({ content: this.i18n.t(locale, 'commands.bestFriendDuoError') });
    }
  }

  private async renderDuoCard(
    interaction: ChatInputCommandInteraction,
    result: DuoChemistryCardResponse,
    peerId: string,
    locale: string,
  ): Promise<void> {
    if (!result.data) {
      return;
    }
    const imageBuffer = Buffer.from(result.data.imageBase64, 'base64');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'duo-chemistry.png' });
    const publishButtonRow = this.buildDuoPublishButtonRow(peerId, locale);

    await interaction.editReply({
      // 버튼 근처 공개 경고 문구(의무, D-3 이행) — "공개하면 상대방을 포함한 채널 전원에게 보입니다"
      content: this.i18n.t(locale, 'commands.bestFriendDuoPublishWarning'),
      files: [attachment],
      components: [publishButtonRow],
    });
  }

  private buildDuoPublishButtonRow(
    peerId: string,
    locale: string,
  ): ActionRowBuilder<ButtonBuilder> {
    const button = new ButtonBuilder()
      .setCustomId(`${DUO_PUBLISH_CUSTOM_ID_PREFIX}${peerId}`)
      .setLabel(this.i18n.t(locale, 'commands.bestFriendDuoPublishButtonLabel'))
      .setStyle(ButtonStyle.Primary);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  }
}
