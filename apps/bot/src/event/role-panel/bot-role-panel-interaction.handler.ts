import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { DEFAULT_LOCALE } from '@onyu/shared';
import { GuildMember, Interaction } from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import {
  RolePanelInteractionService,
  RolePanelInteractionStatus,
} from './bot-role-panel-interaction.service';
import { parseRolePanelCustomId, ROLE_PANEL_CUSTOM_ID_PREFIX } from './role-panel-custom-id';

/** i18n 네임스페이스 — role-panel */
const NS = 'role-panel';

/** locale 저장을 시도하는 성공 계열 상태 (F-ROLE-PANEL-010) */
const LOCALE_SAVE_ELIGIBLE_STATUSES: readonly RolePanelInteractionStatus[] = [
  'GRANTED',
  'REMOVED',
  'SWAPPED',
  'ALREADY_HAS',
  'ALREADY_SELECTED',
];

/**
 * Discord interactionCreate 이벤트를 수신하여 role_panel: 접두사 버튼 인터랙션을 처리한다.
 * 비즈니스 로직(역할 부여/회수, 락)은 RolePanelInteractionService에 위임하고,
 * Discord 응답(deferReply, editReply)과 i18n 메시지 조합은 본 핸들러가 담당한다.
 */
@Injectable()
export class BotRolePanelInteractionHandler {
  private readonly logger = new Logger(BotRolePanelInteractionHandler.name);

  constructor(
    private readonly interactionService: RolePanelInteractionService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
    private readonly botApiClient: BotApiClientService,
  ) {}

  @On('interactionCreate')
  async handle(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    if (!customId.startsWith(`${ROLE_PANEL_CUSTOM_ID_PREFIX}:`)) return;

    // DM 컨텍스트 차단 — UC-04 EX-06 / UC-05 EX-07 (기존 핸들러 패턴과 동일하게 무시)
    if (!interaction.guildId) return;

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    // 중복 resolve 제거: try 밖에서 선언해 catch 블록이 재호출 없이 재사용한다
    // (G 단위 리졸버 확장 이후 재호출은 HTTP 왕복 1회 추가를 의미한다)
    let resolvedLocale: string = DEFAULT_LOCALE;

    try {
      // 3초 ack 확보 — 이후 모든 응답은 editReply 사용
      await interaction.deferReply({ ephemeral: true });

      // locale 한 번 resolve 후 재사용
      resolvedLocale = await this.localeResolver.resolve(userId, guildId, interaction.locale);

      const parsed = parseRolePanelCustomId(customId);
      if (!parsed) {
        await interaction.editReply({ content: this.i18n.t(resolvedLocale, `${NS}.invalid`) });
        return;
      }

      const { panelId, buttonId } = parsed;

      // GuildMember 조회 — Gateway 캐시 우선, 미스 시 fetch
      // interaction.guild는 guildId가 있을 때 봇이 서버에 속해 있으면 항상 존재
      const guild = interaction.guild;
      const member: GuildMember | undefined =
        guild?.members.cache.get(userId) ?? (await guild?.members.fetch(userId));

      if (!member) {
        await interaction.editReply({ content: this.i18n.t(resolvedLocale, `${NS}.genericError`) });
        return;
      }

      const result = await this.interactionService.handle({
        guildId,
        userId,
        member,
        panelId,
        buttonId,
      });

      // localeTag가 있으면 인터랙션 초입에 resolve한 로케일을 덮어쓴다
      // (F-ROLE-PANEL-010 — 저장 API 응답 대기 없이 결정론적으로 렌더)
      const responseLocale = result.localeTag ?? resolvedLocale;

      // locale best-effort 저장: 성공 계열 + localeTag가 있을 때만 시도. 실패해도 응답은 이미 성공.
      if (result.localeTag && LOCALE_SAVE_ELIGIBLE_STATUSES.includes(result.status)) {
        try {
          await this.botApiClient.setUserLocale(userId, result.localeTag);
        } catch (error) {
          this.logger.warn(
            `[ROLE_PANEL] setUserLocale failed: user=${userId} locale=${result.localeTag}`,
            error,
          );
        }
      }

      await interaction.editReply({ content: this.resolveMessage(responseLocale, result.status) });
    } catch (error) {
      this.logger.error(
        `[ROLE_PANEL] Interaction failed: customId=${customId}`,
        error instanceof Error ? error.stack : error,
      );

      try {
        const content = this.i18n.t(resolvedLocale, `${NS}.genericError`);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ ephemeral: true, content });
        } else {
          await interaction.reply({ ephemeral: true, content });
        }
      } catch {
        // Discord 응답 자체가 실패한 경우 무시
      }
    }
  }

  /**
   * 처리 결과 상태를 i18n 메시지로 변환한다.
   */
  private resolveMessage(locale: string, status: RolePanelInteractionStatus): string {
    const keyMap: Record<RolePanelInteractionStatus, string> = {
      GRANTED: 'granted',
      REMOVED: 'removed',
      SWAPPED: 'swapped',
      ALREADY_HAS: 'alreadyHas',
      ALREADY_SELECTED: 'alreadySelected',
      NOT_FOUND: 'notFound',
      NO_PERMISSION: 'noPermission',
      UNKNOWN_ROLE: 'unknownRole',
      LOCKED: 'locked',
    };

    return this.i18n.t(locale, `${NS}.${keyMap[status]}`);
  }
}
