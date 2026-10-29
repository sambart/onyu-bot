import { SlashCommandPipe } from '@discord-nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { parseLocale } from '@onyu/shared';
import { ChatInputCommandInteraction, GuildMember } from 'discord.js';

import { BotI18nService } from '../common/application/bot-i18n.service';
import { LocaleResolverService } from '../common/application/locale-resolver.service';
import { respondWithErrorNotice } from '../common/util/interaction-response.util';
import { MeCommandDto, MeViewOption } from './me.dto';
import { buildProfileCardReply, fetchMeProfileCard } from './me-profile-card';
import { handleRecapView } from './me-recap-card';

@Command({
  name: 'me',
  nameLocalizations: { ko: '미' },
  description: 'View your profile and voice activity',
  descriptionLocalizations: {
    ko: '내 프로필과 음성 활동을 확인합니다',
    'pt-BR': 'Veja seu perfil e sua atividade de voz',
    ja: 'プロフィールとボイスアクティビティを確認',
  },
})
@Injectable()
export class MeCommand {
  private readonly logger = new Logger(MeCommand.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    private readonly i18n: BotI18nService,
    private readonly localeResolver: LocaleResolverService,
  ) {}

  @Handler()
  async onMe(
    @InteractionEvent() interaction: ChatInputCommandInteraction,
    @InteractionEvent(SlashCommandPipe) dto: MeCommandDto,
  ): Promise<void> {
    const locale = await this.localeResolver.resolve(
      interaction.user.id,
      interaction.guildId,
      interaction.locale,
    );

    // 첫 응답(reply/deferReply)까지 try 안에 둔다 — 밖이면 실패 시 사용자에게 "응답 없음"(감사 A12)
    try {
      if (!interaction.guildId) {
        await interaction.reply({
          content: this.i18n.t(locale, 'errors.guildOnly'),
          ephemeral: true,
        });
        return;
      }

      // 결산은 별도 라우트(B1)라 profile 경로(viewOption·me-ment 쿼터)와 섞지 않는다.
      // 창 밖 안내는 defer 없이 ephemeral reply 해야 하므로 deferReply 앞에서 위임한다.
      if (dto.view === MeViewOption.Recap) {
        await handleRecapView({
          interaction,
          apiClient: this.apiClient,
          i18n: this.i18n,
          locale,
          logger: this.logger,
        });
        return;
      }

      await interaction.deferReply();

      const displayName =
        (interaction.member as GuildMember)?.displayName ?? interaction.user.displayName;
      const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });

      const viewOption = dto.view === MeViewOption.Voice ? 'voice' : undefined;

      const result = await fetchMeProfileCard(this.apiClient, {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        displayName,
        avatarUrl,
        viewOption,
        locale: parseLocale(locale),
        // 옵션 없이 항상 자동 요청한다(F-VOICE-079 후속 개정) — 레이아웃 B(`보기:음성`)
        // 스킵과 쿼터 미소모는 API의 `effectiveMentType` 가드(D6)가 소유한다(A1, 판정
        // 중복 금지). 봇은 view를 선판정하지 않는다.
        mentType: 'analysis',
      });

      const reply = buildProfileCardReply({
        i18n: this.i18n,
        locale,
        guildId: interaction.guildId,
        result,
        noActivityKey: 'commands.meNoActivity',
        attachmentName: 'profile.png',
      });

      await interaction.editReply(reply);
    } catch (error) {
      this.logger.error('Me command error', error instanceof Error ? error.stack : String(error));
      await respondWithErrorNotice(
        interaction,
        this.i18n.t(locale, 'commands.meError'),
        this.logger,
      );
    }
  }
}
