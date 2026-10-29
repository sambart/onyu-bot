import { Command, EventParams, Handler } from '@discord-nestjs/core';
import { Injectable } from '@nestjs/common';
import { BRAND_INT } from '@onyu/shared';
import { ClientEvents, EmbedBuilder } from 'discord.js';

/** 미주입(로컬 개발·테스트) 시 표시값 — 표시 전용이라 api 의 `null` 규약과 달리 문자열로 둔다. */
const UNKNOWN_VERSION_LABEL = 'dev';

/**
 * 빌드 시점 주입 릴리즈 버전(`v1.83.0` 형태)을 읽는다. 버전 정본은 git 태그이며
 * `deploy.yml`(VERSION) → `docker-bake.hcl` bot 타깃 args → `Dockerfile.prod` bot 스테이지
 * ARG/ENV 로 전달된다. package.json version 은 릴리즈마다 갱신하지 않으므로 읽지 않는다.
 */
function resolveBotVersion(): string {
  const raw = process.env.APP_VERSION?.trim();
  return raw ? raw : UNKNOWN_VERSION_LABEL;
}

@Injectable()
@Command({
  name: 'version',
  description: 'Show the bot version',
  descriptionLocalizations: {
    ko: '봇의 버전 정보를 표시합니다.',
    'pt-BR': 'Mostra a versão do bot',
    ja: 'ボットのバージョン情報を表示',
  },
})
export class VersionCommand {
  @Handler()
  async onVersion(@EventParams() args: ClientEvents['interactionCreate']): Promise<void> {
    const [interaction] = args;
    if (!interaction.isChatInputCommand()) return;

    const embed = new EmbedBuilder()
      .setTitle('Onyu')
      .setDescription(resolveBotVersion())
      .setColor(BRAND_INT)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
