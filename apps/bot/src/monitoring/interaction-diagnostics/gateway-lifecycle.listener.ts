import { InjectDiscordClient, On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Client } from 'discord.js';

import {
  PING_CHECK_INTERVAL_MS,
  PING_CHECK_INTERVAL_NAME,
  PING_WARN_THRESHOLD_MS,
} from './interaction-diagnostics.constants';

/** 게이트웨이 샤드 생명주기·client 경고/에러·ws ping 지연을 로깅한다. */
@Injectable()
export class GatewayLifecycleListener {
  private readonly logger = new Logger(GatewayLifecycleListener.name);

  constructor(@InjectDiscordClient() private readonly client: Client) {}

  @On('shardDisconnect')
  onShardDisconnect(closeEvent: { code: number }, shardId: number): void {
    this.logger.warn(`[GATEWAY] shard disconnect shard=${shardId} code=${closeEvent.code}`);
  }

  @On('shardReconnecting')
  onShardReconnecting(shardId: number): void {
    this.logger.warn(`[GATEWAY] shard reconnecting shard=${shardId}`);
  }

  @On('shardResume')
  onShardResume(shardId: number, replayedEvents: number): void {
    this.logger.warn(`[GATEWAY] shard resumed shard=${shardId} replayed=${replayedEvents}`);
  }

  @On('shardError')
  onShardError(error: Error, shardId: number): void {
    this.logger.error(
      `[GATEWAY] shard error shard=${shardId} message=${error.message}`,
      error.stack,
    );
  }

  @On('invalidated')
  onInvalidated(): void {
    this.logger.error('[GATEWAY] session invalidated');
  }

  @On('shardReady')
  onShardReady(shardId: number): void {
    this.logger.log(`[GATEWAY] shard ready shard=${shardId}`);
  }

  @On('warn')
  onClientWarn(info: string): void {
    this.logger.warn(`[GATEWAY] client warn: ${info}`);
  }

  @On('error')
  onClientError(error: Error): void {
    this.logger.error(`[GATEWAY] client error: ${error.message}`, error.stack);
  }

  @Interval(PING_CHECK_INTERVAL_NAME, PING_CHECK_INTERVAL_MS)
  checkPing(): void {
    const ping = this.client.ws.ping;
    if (ping > PING_WARN_THRESHOLD_MS) {
      this.logger.warn(`[GATEWAY] high ws ping=${ping}ms threshold=${PING_WARN_THRESHOLD_MS}ms`);
    }
  }
}
