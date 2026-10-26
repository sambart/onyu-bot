import { InjectDiscordClient, On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import type { Client, Interaction } from 'discord.js';

import {
  CUSTOM_ID_LOG_MAX_LENGTH,
  CUSTOM_ID_SEPARATOR,
  INTERACTION_CHECK_AT_MS,
} from './interaction-diagnostics.constants';

/**
 * 모든 응답 가능한 인터랙션의 수신(L2)과 3초 데드라인 내 무응답(L1)을 로깅한다.
 * 도메인 핸들러 동작에는 관여하지 않으며, 핸들러 실행 순서와 무관하게 타이머로 판정한다.
 *
 * discord.js 14.25.1 의 showModal() 은 replied=true 를 세우므로
 * (InteractionResponses.js showModal) 모달 응답도 replied 로 감지된다.
 */
@Injectable()
export class InteractionDiagnosticsListener {
  private readonly logger = new Logger(InteractionDiagnosticsListener.name);

  constructor(@InjectDiscordClient() private readonly client: Client) {}

  @On('interactionCreate')
  handle(interaction: Interaction): void {
    // autocomplete 는 소음이고 reply 대상이 아니다
    if (interaction.isAutocomplete() || !interaction.isRepliable()) return;

    const type = this.describeType(interaction);
    const key = this.describeKey(interaction);
    const guildId = interaction.guildId ?? 'dm';
    const userId = interaction.user.id;
    const receiveDelayMs = Date.now() - interaction.createdTimestamp;

    this.logger.log(
      `[INTERACTION] received type=${type} key=${key} guild=${guildId} user=${userId} delayMs=${receiveDelayMs} ping=${this.client.ws.ping}`,
    );

    // 수신이 늦었어도 Discord 데드라인(createdTimestamp 기준) 시점에 판정한다
    const delay = Math.max(0, interaction.createdTimestamp + INTERACTION_CHECK_AT_MS - Date.now());
    const timer = setTimeout(() => {
      if (interaction.replied || interaction.deferred) return;
      this.logger.warn(
        `[INTERACTION] no response within deadline type=${type} key=${key} guild=${guildId} user=${userId} delayMs=${receiveDelayMs} ping=${this.client.ws.ping}`,
      );
    }, delay);
    timer.unref();
  }

  private describeType(interaction: Interaction): string {
    if (interaction.isButton()) return 'button';
    if (interaction.isAnySelectMenu()) return 'select';
    if (interaction.isModalSubmit()) return 'modal';
    if (interaction.isChatInputCommand()) return 'slash';
    if (interaction.isContextMenuCommand()) return 'context';
    return `type${interaction.type}`;
  }

  /** customId 는 첫 구분자까지만(길이 상한 적용), 커맨드는 이름을 반환한다 */
  private describeKey(interaction: Interaction): string {
    if (interaction.isCommand()) return interaction.commandName;
    if ('customId' in interaction && typeof interaction.customId === 'string') {
      const sepIdx = interaction.customId.indexOf(CUSTOM_ID_SEPARATOR);
      const prefix = sepIdx >= 0 ? interaction.customId.slice(0, sepIdx + 1) : interaction.customId;
      return prefix.slice(0, CUSTOM_ID_LOG_MAX_LENGTH);
    }
    return 'unknown';
  }
}
