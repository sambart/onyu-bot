import { SlashCommandPipe } from '@discord-nestjs/common';
import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { CanvasCardLocale } from '@onyu/bot-api-client';
import { BotApiClientService } from '@onyu/bot-api-client';
import { ChatInputCommandInteraction, GuildMember } from 'discord.js';

import { BotI18nService } from '../common/application/bot-i18n.service';
import { LocaleResolverService } from '../common/application/locale-resolver.service';
import { MeCommandDto, MeViewOption } from './me.dto';
import { buildProfileCardReply, fetchMeProfileCard } from './me-profile-card';

@Command({
  name: 'me',
  nameLocalizations: { ko: '미' },
  description: 'View your profile and voice activity',
  descriptionLocalizations: { ko: '내 프로필과 음성 활동을 확인합니다' },
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

    if (!interaction.guildId) {
      await interaction.reply({
        content: this.i18n.t(locale, 'errors.guildOnly'),
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
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
        locale: this.toCanvasLocale(locale),
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
      await interaction.editReply({ content: this.i18n.t(locale, 'commands.meError') });
    }
  }

  /** LocaleResolverService는 'ko' | 'en' 중 하나만 반환하므로 안전하게 캔버스 카드 로케일로 변환한다(F-VOICE-082, best-friend.command.ts 선례) */
  private toCanvasLocale(locale: string): CanvasCardLocale {
    return locale === 'ko' ? 'ko' : 'en';
  }
}
