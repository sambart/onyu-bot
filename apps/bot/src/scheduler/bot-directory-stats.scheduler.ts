import { InjectDiscordClient, Once } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Client } from 'discord.js';

import { KoreanbotsStatsPosterService } from '../monitoring/koreanbots-stats/koreanbots-stats-poster.service';
import { TopggStatsPosterService } from '../monitoring/topgg-stats/topgg-stats-poster.service';

// koreanbots는 stats 미수신 48시간 경과 시 오프라인으로 판정한다 — 30분 주기면 충분한 여유(레이트리밋 3분당 3회 대비).
const BOT_DIRECTORY_STATS_INTERVAL_MS = 30 * 60 * 1000;
// 봇은 ShardingManager 없이 단일 프로세스로 동작한다(discord.config.ts) — 샤드 수 고정 1.
const NO_SHARDING_SHARD_COUNT = 1;

/**
 * 봇 디렉토리(koreanbots.dev, top.gg) stats(서버 수)를 봇 ready 직후 1회 + 이후 30분 간격으로
 * 병렬 전송한다. koreanbots는 봇이 자기네 길드에 없으면 DB `updated_at`(stats 수신 시 갱신)이
 * 48시간 이내인지로 온라인 여부를 판정하므로(docs/ops/growth-channels.md,
 * docs/reviews/topgg-listing-strategy.md §④·§⑥), 주기 전송으로 온라인 상태를 유지한다.
 *
 * 각 포스터 서비스가 이미 전송 실패를 warn 로깅 후 삼키므로(예외 전파 없음), 한쪽 실패가 다른
 * 쪽 전송을 막지 않도록 Promise.all로 병렬 호출한다. 디렉토리별 URL/헤더/바디 형식은 각 포스터
 * 서비스에 격리된다.
 */
@Injectable()
export class BotDirectoryStatsScheduler {
  private readonly logger = new Logger(BotDirectoryStatsScheduler.name);

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly koreanbotsPoster: KoreanbotsStatsPosterService,
    private readonly topggPoster: TopggStatsPosterService,
  ) {}

  /** 봇 ready 직후 최초 1회 즉시 전송한다(오프라인 판정 창을 최대한 빨리 해소). */
  @Once('clientReady')
  async handleReady(): Promise<void> {
    await this.pushStats();
  }

  /** 이후 30분 간격으로 반복 전송한다. */
  @Interval('bot-directory-stats-push', BOT_DIRECTORY_STATS_INTERVAL_MS)
  async handleInterval(): Promise<void> {
    await this.pushStats();
  }

  private async pushStats(): Promise<void> {
    if (!this.koreanbotsPoster.isEnabled && !this.topggPoster.isEnabled) return;

    const { client } = this;
    if (!client.isReady()) {
      this.logger.debug('[BOT-DIRECTORY-STATS] Discord client 미준비 — 이번 주기 skip');
      return;
    }

    const botId = client.user.id;
    const servers = client.guilds.cache.size;

    await Promise.all([
      this.koreanbotsPoster.postStats(botId, servers, NO_SHARDING_SHARD_COUNT),
      this.topggPoster.postStats(botId, servers),
    ]);
  }
}
