import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { BotMetricsModule } from '../monitoring/bot-metrics.module';
import { HeartbeatModule } from '../monitoring/heartbeat/heartbeat.module';
import { KoreanbotsStatsModule } from '../monitoring/koreanbots-stats/koreanbots-stats.module';
import { BotCoPresenceScheduler } from './bot-co-presence.scheduler';
import { BotDirectoryStatsScheduler } from './bot-directory-stats.scheduler';
import { BotHealthSnapshotScheduler } from './bot-health-snapshot.scheduler';

@Module({
  imports: [DiscordModule.forFeature(), HeartbeatModule, BotMetricsModule, KoreanbotsStatsModule],
  providers: [BotCoPresenceScheduler, BotHealthSnapshotScheduler, BotDirectoryStatsScheduler],
})
export class BotSchedulerModule {}
