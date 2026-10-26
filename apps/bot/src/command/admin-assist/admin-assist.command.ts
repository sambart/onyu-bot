import { SlashCommandPipe } from '@discord-nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { parseLocale } from '@onyu/shared';
import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { AdminAssistCommandDto } from './admin-assist.dto';
import { buildAdminAssistEmbed } from './admin-assist-embed.builder';

/** WEB_URL 미설정 시 prod 도메인 (help.command.ts:10 관례) */
const DEFAULT_WEB_URL = 'https://onyu.dev';

/**
 * `/관리도우미`(`/admin-assist`, F-ADMIN-ASSIST-078) — 본 도메인 최초의 봇 슬래시 커맨드
 * 진입점. **read-only** — 봇 표면에 설정 저장·게시 라우트를 1개도 만들지 않는다(admin-assist-
 * bot-entrypoint 계획 결정 ①). `AdminAssistService.recommend()`(E1)를 bot-api(E8)를 거쳐
 * 그대로 재사용한다 — 신규 비즈니스 로직 0.
 *
 * 🔒 **권한은 2중 검증**: ① `defaultMemberPermissions`(클라이언트 필터, 보안 경계 아님)
 * ② `interaction.memberPermissions?.has()` 런타임 재검증(실질 권한 게이트, sticky-message-
 * register.command.ts 선례). ②에서 실패하면 API 를 호출하지 않는다(쿼터 미소모).
 * 🔒 **ephemeral 강제** — 성공·폴백·에러 전 경로(PRD F-080). 타협 대상 아님.
 */
@Command({
  name: 'admin-assist',
  nameLocalizations: { ko: '관리도우미' },
  description: 'Ask about server settings and activity analysis (admin only)',
  descriptionLocalizations: {
    ko: '서버 설정·활동 분석에 대해 물어봅니다 (관리자 전용)',
    'pt-BR': 'Pergunte sobre configurações e análise de atividade do servidor (só admins)',
  },
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
})
@Injectable()
export class AdminAssistCommand {
  private readonly logger = new Logger(AdminAssistCommand.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onAdminAssist(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    // SlashCommandPipe 바인딩 자체가 회귀 가드 목적이며 실제 값은 interaction.options로 읽는다
    // (best-friend.command.ts의 `_dto` 관례).
    @InteractionEvent(SlashCommandPipe) _dto: AdminAssistCommandDto,
  ): Promise<void> {
    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    // 🔒 B1 — guildId 확인을 먼저 둔다(UC-08 §4.1). DM 에서는 memberPermissions 가 null 이라
    // 권한 체크를 먼저 하면 "권한 없음"으로 오분류된다(sticky-register 선례와 순서가 갈리는
    // 이유). API 호출 0 — 쿼터 미소모.
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: this.i18n.t(locale, 'errors.guildOnly'),
        ephemeral: true,
      });
      return;
    }

    // 🔒 B2 — 런타임 재검증(실질 권한 게이트, endpoint-spec §5E-3 ②). 클라이언트 필터
    // 우회 등 방어적 상황에서만 도달한다. API 호출 0 — 쿼터 미소모.
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: this.i18n.t(locale, 'errors.manageGuildOnly'),
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const queryText = interaction.options.getString('query', true);

    try {
      const result = await this.apiClient.getAdminAssistRecommendation({
        guildId,
        // 🔒 언제나 실행자 — 옵션으로 지목된 타인 id 를 넣지 않는다(F5 조인 키 불변식,
        // endpoint-spec §5E-3 ②)
        userId: interaction.user.id,
        queryText,
        locale: parseLocale(locale),
        // writeLocale 은 1차 미전송(endpoint-spec §5E-2 🟨 — 길드 전체가 읽는 글에 실행자
        // 1인 로케일을 강제하지 않기 위함)
      });

      if (result.ok === false) {
        // 🔒 "쿼터 소진"(정상·예상된 결과)과 "장애"를 같은 문구로 뭉개지 않는다(§8-3 요건)
        const key =
          result.reason === 'quota_exhausted'
            ? 'commands.adminAssistQuotaExhausted'
            : 'commands.adminAssistError';
        await interaction.editReply({ content: this.i18n.t(locale, key) });
        return;
      }

      // ⚠️ §9-3 — HTTP 200 ≠ 결과 성공. resultStatus 를 먼저 보는 분기는 embed 빌더가
      // 전담한다(llm_error 도 200 으로 내려오므로 여기서 catch 로 걸러지지 않는다).
      const webUrl = process.env['WEB_URL'] ?? DEFAULT_WEB_URL;
      const embed = buildAdminAssistEmbed(result.data, {
        locale,
        i18n: this.i18n,
        webUrl,
        guildId,
      });
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      this.logger.error(
        'AdminAssist command error',
        error instanceof Error ? error.stack : String(error),
      );
      await interaction.editReply({ content: this.i18n.t(locale, 'commands.adminAssistError') });
    }
  }
}
