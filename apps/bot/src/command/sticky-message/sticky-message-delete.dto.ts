import { Channel, Param, ParamType } from '@discord-nestjs/core';
import { ChannelType } from 'discord.js';

export class StickyMessageDeleteDto {
  @Channel([ChannelType.GuildText])
  @Param({
    name: 'channel',
    nameLocalizations: { ko: '채널' },
    description: 'Channel to delete sticky messages from',
    descriptionLocalizations: {
      ko: '고정메세지를 삭제할 채널',
      'pt-BR': 'Canal de onde excluir as mensagens fixas',
      ja: '固定メッセージを削除するチャンネル',
    },
    required: true,
    type: ParamType.STRING,
  })
  channel: string;
}
