import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService, type GuildLifecycleEventDto } from '@onyu/bot-api-client';
import type { Guild } from 'discord.js';

/**
 * 독립 길드 생애주기 수집 이벤트 핸들러 (F-USAGE-013/014).
 * 봇이 길드에 추가/제거될 때 join/leave 를 각각 기록한다.
 *
 * 유저 ID·길드명·멤버 수는 수집하지 않는다 — guildId/eventType(+join 시 봇 자신의
 * permissionsSnapshot, F-USAGE-061)만 API로 전달한다 (개인 미식별 🔒, PRD §15-2).
 */
@Injectable()
export class BotGuildLifecycleHandler {
  private readonly logger = new Logger(BotGuildLifecycleHandler.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @On('guildCreate')
  async handleGuildCreate(guild: Guild): Promise<void> {
    const permissionsSnapshot = this.readPermissionsSnapshot(guild);
    await this.send({
      guildId: guild.id,
      eventType: 'join',
      // 값이 있을 때만 필드 자체를 포함한다 — `permissionsSnapshot: undefined`로 키만 남기면
      // 개인 미식별 payload 최소성 계약(guildId·eventType 외 필드 없음)이 깨진다(EC-USAGE-27/38).
      ...(permissionsSnapshot != null ? { permissionsSnapshot } : {}),
    });
  }

  /**
   * 봇 자신의 길드 레벨 권한 비트필드를 10진 문자열로 읽는다(F-USAGE-061).
   * `guild.members.me` 부재·읽기 실패 시 필드 자체를 생략한다(`"0"` 아님, EC-USAGE-27/38) —
   * join 전송 자체는 이 값과 무관하게 항상 계속된다.
   */
  private readPermissionsSnapshot(guild: Guild): string | undefined {
    try {
      return guild.members.me?.permissions.bitfield.toString();
    } catch (err: unknown) {
      this.logger.warn(
        `[BOT] permissionsSnapshot read failed: guild=${guild.id} err=${err instanceof Error ? err.message : String(err)}`,
      );
      return undefined;
    }
  }

  @On('guildDelete')
  async handleGuildDelete(guild: Guild): Promise<void> {
    await this.send({ guildId: guild.id, eventType: 'leave' });
  }

  // fire-and-forget. 생애주기 이벤트는 저빈도라 재시도 없이 단순 catch 로그로 충분(구현 재량).
  private async send(dto: GuildLifecycleEventDto): Promise<void> {
    await this.apiClient.sendGuildLifecycleEvent(dto).catch((err: unknown) => {
      this.logger.error(
        `[BOT] guildLifecycleEvent forwarding failed: guild=${dto.guildId} eventType=${dto.eventType}`,
        err instanceof Error ? err.stack : err,
      );
    });
  }
}
