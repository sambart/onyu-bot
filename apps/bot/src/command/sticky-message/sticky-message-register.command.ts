import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandInteraction, PermissionFlagsBits } from 'discord.js';

@Command({
  name: '고정메세지등록',
  description: '고정메세지를 웹 대시보드에서 등록합니다',
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
})
@Injectable()
export class StickyMessageRegisterCommand {
  private readonly logger = new Logger(StickyMessageRegisterCommand.name);

  constructor(private readonly configService: ConfigService) {}

  @Handler()
  async onRegister(
    @InteractionEvent() interaction: CommandInteraction,
  ): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: '이 명령어는 서버 관리자만 사용할 수 있습니다.',
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: '서버에서만 사용 가능한 명령어입니다.',
        ephemeral: true,
      });
      return;
    }

    const webUrl = this.configService.get<string>('WEB_URL', 'http://localhost:4000');
    const settingsUrl = `${webUrl}/settings/guild/${guildId}/sticky-message`;

    await interaction.reply({
      content: `고정메세지는 웹 대시보드에서 설정할 수 있습니다.\n${settingsUrl}`,
      ephemeral: true,
    });
  }
}
