import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService, type CommandUsedDto } from '@onyu/bot-api-client';
import type { Interaction } from 'discord.js';

/**
 * 독립 커맨드 사용 수집 이벤트 핸들러 (F-USAGE-001~004).
 * 슬래시 커맨드(ChatInputCommand)만 집계하며, 버튼/모달 등 다른 인터랙션과
 * DM(guildId 없음)은 드롭한다.
 *
 * 유저 ID·커맨드 인자는 수집하지 않는다 — guild/commandName/locale 만 API로 전달한다
 * (개인 미식별 🔒 D2, PRD §2).
 */
@Injectable()
export class BotCommandUsageHandler {
  private readonly logger = new Logger(BotCommandUsageHandler.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @On('interactionCreate')
  async handleInteractionCreate(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) return; // 버튼/모달 등 드롭 (F-USAGE-002)
    if (!interaction.guildId) return; // DM 드롭 — 센티널 없음 (§2 🔒, F-USAGE-002)

    const payload: CommandUsedDto = {
      guildId: interaction.guildId,
      commandName: interaction.commandName,
      locale: interaction.locale, // 클라이언트 로케일 — 길드 preferredLocale 아님 (F-USAGE-004)
    };

    // fire-and-forget. 커맨드 이벤트는 저빈도라 재시도 없이 단순 catch 로그로 충분(구현 재량).
    await this.apiClient.sendCommandUsed(payload).catch((err: unknown) => {
      this.logger.error(
        `[BOT] commandUsed forwarding failed: guild=${interaction.guildId}`,
        err instanceof Error ? err.stack : err,
      );
    });
  }
}
