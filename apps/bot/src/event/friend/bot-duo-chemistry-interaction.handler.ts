import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { AttachmentBuilder, type ButtonInteraction, type Interaction } from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';

/** i18n 네임스페이스 — commands (BotI18nService.BOT_NAMESPACES에 이미 포함) */
const NS = 'commands';
/** `best-friend.command.ts`의 `DUO_PUBLISH_CUSTOM_ID_PREFIX`와 공유. 형태: `friend:duo:publish:{peerId}` */
const CUSTOM_ID_PREFIX = 'friend:duo:publish:';
/** 채널 공개 게시 시 첨부 파일명 — `best-friend.command.ts`의 렌더 첨부와 동일하게 통일 */
const PUBLISHED_ATTACHMENT_NAME = 'duo-chemistry.png';

/**
 * [🔗 채널에 공개하기] 버튼(F-COPRESENCE-029, D-3) interactionCreate 이벤트를 처리한다.
 * `bot-me-interaction.handler.ts` 패턴 준용.
 *
 * PR#416 리뷰 결함1+2 수정: 종전엔 이 핸들러가 API(`getDuoChemistry`)를 재호출해 카드를
 * 처음부터 다시 렌더링했다. 카드 캐시(TTL 5분) 경과 후 클릭(버튼 자체는 15분 유효)하면
 * DB 집계+캔버스 렌더+base64 왕복이 Discord의 3초 ACK 창을 넘겨 Unknown interaction(10062)로
 * 클릭이 조용히 무시됐다. 이제는 API를 다시 부르지 않고, ephemeral 원본 메시지에 이미 첨부된
 * 카드 PNG의 CDN URL을 그대로 재사용해 채널에 게시한다 — 렌더 0회, DB 조회 0회.
 * 진입 즉시 `deferUpdate()`로 먼저 ACK한 뒤(CDN 재업로드 지연에 대비해 defer 유지) 첨부를
 * 재사용하므로 3초 창 문제가 구조적으로 사라진다.
 *
 * 버튼 클릭은 원본 ephemeral 응답과 별개의 새 `MessageComponentInteraction`(자체 15분 토큰)이므로
 * ① 원본 ephemeral 메시지의 버튼을 제거(중복 게시 방지)한 뒤 ② 채널에 공개 게시하고,
 * ③ 게시가 성공하면 ephemeral 원본을 `deleteReply()`로 삭제해 화면에 중복 카드가 남지 않게 한다.
 *
 * ephemeral 만료(15분 초과)·봇 재시작 후 클릭 시 Discord가 클라이언트에 자체 실패 표시를
 * 하므로(EC-CP-49), 여기서는 예외를 흡수하고 로그만 남긴다 — 500(미처리 예외)으로 흘리지 않는다.
 */
@Injectable()
export class BotDuoChemistryInteractionHandler {
  private readonly logger = new Logger(BotDuoChemistryInteractionHandler.name);

  constructor(
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @On('interactionCreate')
  async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith(CUSTOM_ID_PREFIX)) return;

    // DM에서는 채널 공개 게시 대상이 없다(EC-CP-49 인접 방어) — 시도하지 않는다
    if (!interaction.guildId) return;

    const guildId = interaction.guildId;
    // 버튼을 누른 사람 = 이 인터랙션의 유일한 열람자(ephemeral 원 메시지는 실행자만 볼 수
    // 있으므로 "원 실행자가 아님" 케이스는 구조적으로 도달 불가하다 — EC-CP-49 인접 방어의
    // 취지는 이 가정을 강제하는 것이며, 클릭자를 항상 요청 주체로 취급하는 것이 그 이행이다).
    const userId = interaction.user.id;

    try {
      // 3초 ACK 창 확보 — 이 시점 이후 실패는 전부 followUp/editReply로 안내한다.
      await interaction.deferUpdate();
      await this.publishDuoCard(interaction, guildId, userId);
    } catch (error) {
      // EC-CP-49 — 만료된 상호작용(15분 초과)·봇 재시작 후 클릭. Discord가 클라이언트에
      // 자체 실패 표시를 하므로 대체 안내를 시도하되, 실패해도(재차 만료 등) 조용히 흡수한다.
      this.logger.warn(
        `[DUO] publish interaction failed: customId=${interaction.customId} — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.replyPublishFailureSafely(interaction, guildId, userId);
    }
  }

  private async publishDuoCard(
    interaction: ButtonInteraction,
    guildId: string,
    userId: string,
  ): Promise<void> {
    const locale = await this.localeResolver.resolve(userId, guildId, interaction.locale);

    // 원본 ephemeral 메시지에 첨부된 카드 PNG의 CDN URL을 재사용한다 — AttachmentBuilder에
    // URL 문자열을 전달하면 discord.js가 전송 시점에 내부적으로 fetch해 재업로드한다
    // (DataResolver.resolveFile). API 재호출·재렌더 없음.
    const sourceUrl = interaction.message.attachments.first()?.url;
    if (!sourceUrl) {
      await interaction.followUp({
        content: this.i18n.t(locale, `${NS}.bestFriendDuoPublishFailed`),
        ephemeral: true,
      });
      return;
    }

    const attachment = new AttachmentBuilder(sourceUrl, { name: PUBLISHED_ATTACHMENT_NAME });

    // ① 원본 ephemeral 메시지 버튼 제거(중복 게시 방지) → ② 채널 공개 게시(Q3 확정) → ③ 게시
    // 성공 시 ephemeral 원본 삭제(아래). deferUpdate() 이후이므로 원본 메시지 갱신은
    // update()가 아닌 editReply()로 수행한다.
    await interaction.editReply({ components: [] });

    try {
      await interaction.followUp({ ephemeral: false, files: [attachment] });
    } catch (publishError) {
      // 봇에 채널 전송 권한이 없는 경우 등(edge-cases §11.2 인접 방어) — 예외를 밖으로
      // 던지지 않고 ephemeral로 사유를 안내한다. editReply()가 이미 원본을 갱신했으므로
      // 후속 안내는 followUp()으로 보낸다.
      this.logger.warn(
        `[DUO] channel publish failed: ${
          publishError instanceof Error ? publishError.message : String(publishError)
        }`,
      );
      await interaction.followUp({
        content: this.i18n.t(locale, `${NS}.bestFriendDuoPublishFailed`),
        ephemeral: true,
      });
      return;
    }

    // ③ 채널 공개 게시가 성공한 뒤에만 ephemeral 원본을 삭제한다 — followUp()이 원본 첨부의
    // CDN URL을 전송 시점에 fetch하므로(위 AttachmentBuilder 주석 참고), 먼저 지우면 그 사이
    // 원본 메시지가 사라져 첨부 fetch가 깨질 수 있다. 반드시 게시 성공 이후여야 한다.
    // ephemeral 메시지는 채널 메시지 DELETE 라우트로 지울 수 없고(`interaction.message.delete()`
    // 불가), 인터랙션 웹훅 경유인 `deleteReply()`만 유효하다.
    try {
      await interaction.deleteReply();
    } catch (deleteError) {
      // EC-CP-49 흡수 관례와 동일 — 실패해도 예외를 밖으로 던지지 않는다(바깥 catch로 흘러가면
      // 이미 성공한 게시에 대해 불필요한 실패 안내가 뜬다). 최악의 경우 버튼 없는 ephemeral 카드가
      // 남는 정도이며, 이는 이 변경 이전의 현행 동작과 같아 수용 가능하다.
      this.logger.warn(
        `[DUO] ephemeral deleteReply failed: ${
          deleteError instanceof Error ? deleteError.message : String(deleteError)
        }`,
      );
    }
  }

  /**
   * Discord 응답 자체가 실패한 경우(만료 등, EC-CP-49) 무시한다 — `bot-me-interaction.handler.ts`
   * 관례. `deferUpdate()`가 이미 성공한 뒤(=인터랙션이 acknowledged 상태) 발생한 실패는
   * `reply()`가 아닌 `followUp()`으로 안내해야 한다(이미 ACK된 인터랙션에 reply()는 예외를 던진다).
   */
  private async replyPublishFailureSafely(
    interaction: ButtonInteraction,
    guildId: string,
    userId: string,
  ): Promise<void> {
    try {
      const locale = await this.localeResolver.resolve(userId, guildId, interaction.locale);

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: this.i18n.t(locale, `${NS}.bestFriendDuoPublishFailed`),
          ephemeral: true,
        });
        return;
      }

      if (!interaction.isRepliable()) return;
      await interaction.reply({
        content: this.i18n.t(locale, `${NS}.bestFriendDuoPublishFailed`),
        ephemeral: true,
      });
    } catch {
      // Discord 응답 자체가 실패한 경우 무시
    }
  }
}
