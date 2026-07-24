import { InjectDiscordClient } from '@discord-nestjs/core';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { BotHealthSnapshotDto } from '@onyu/bot-api-client';
import { Client } from 'discord.js';
import { collectDefaultMetrics, Gauge, Registry } from 'prom-client';

const UPTIME_MS_PER_SECOND = 1000;

@Injectable()
export class BotPrometheusService implements OnModuleInit {
  private readonly logger = new Logger(BotPrometheusService.name);
  private readonly registry = new Registry();

  readonly gatewayPing: Gauge;
  readonly guildCount: Gauge;
  readonly voiceUsersTotal: Gauge;
  readonly uptimeSeconds: Gauge;

  constructor(@InjectDiscordClient() private readonly client: Client) {
    this.gatewayPing = new Gauge({
      name: 'discord_gateway_ping_ms',
      help: 'Discord WebSocket ping in milliseconds',
      registers: [this.registry],
    });

    this.guildCount = new Gauge({
      name: 'discord_guild_count',
      help: 'Number of guilds the bot is in',
      registers: [this.registry],
    });

    this.voiceUsersTotal = new Gauge({
      name: 'discord_voice_users_total',
      help: 'Number of voice channel users per guild (excluding bots)',
      labelNames: ['guildId'] as const,
      registers: [this.registry],
    });

    this.uptimeSeconds = new Gauge({
      name: 'bot_uptime_seconds',
      help: 'Bot uptime in seconds',
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  /**
   * 15초 간격으로 Discord Client에서 메트릭 값을 읽어 Gauge를 갱신한다.
   * Discord Client 미연결 시 ping/guildCount/uptime은 0으로 설정하고,
   * voiceUsersTotal은 갱신 생략 (이전 값 유지).
   */
  @Cron('*/15 * * * * *')
  refreshMetrics(): void {
    try {
      const isReady = this.client.isReady();

      if (!isReady) {
        this.gatewayPing.set(0);
        this.guildCount.set(0);
        this.uptimeSeconds.set(0);
        return;
      }

      this.gatewayPing.set(this.client.ws.ping);
      this.guildCount.set(this.client.guilds.cache.size);
      this.uptimeSeconds.set((this.client.uptime ?? 0) / UPTIME_MS_PER_SECOND);

      for (const guild of this.client.guilds.cache.values()) {
        const voiceUserCount = guild.voiceStates.cache.filter(
          (vs) => vs.channelId !== null && !vs.member?.user.bot,
        ).size;

        this.voiceUsersTotal.labels(guild.id).set(voiceUserCount);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to refresh metrics: ${message}`);
    }
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }

  /**
   * 헬스 스냅샷 push(F-SUPER-ADMIN-016)용 raw 값 스냅샷.
   * prom-client Gauge는 raw 값을 노출하지 않으므로 Discord Client에서 직접 재수집한다.
   * Client 미준비 시 전 필드 0을 반환한다.
   *
   * API 측 BotHealthSnapshotDto는 `@IsInt() @Min(0)` 계약이므로,
   * uptimeSeconds는 정수로 절사하고 gatewayPing은 0 미만(하트비트 ACK 이전 discord.js가
   * 반환할 수 있는 -1 등)을 0으로 클램프한다.
   */
  getSnapshot(): BotHealthSnapshotDto {
    if (!this.client.isReady()) {
      return { gatewayPing: 0, guildCount: 0, voiceUsersTotal: 0, uptimeSeconds: 0 };
    }

    let voiceUsersTotal = 0;
    for (const guild of this.client.guilds.cache.values()) {
      voiceUsersTotal += guild.voiceStates.cache.filter(
        (vs) => vs.channelId !== null && !vs.member?.user.bot,
      ).size;
    }

    return {
      gatewayPing: Math.max(0, this.client.ws.ping),
      guildCount: this.client.guilds.cache.size,
      voiceUsersTotal,
      uptimeSeconds: Math.floor((this.client.uptime ?? 0) / UPTIME_MS_PER_SECOND),
    };
  }
}
