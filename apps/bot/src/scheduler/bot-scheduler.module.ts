import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { BotMetricsModule } from '../monitoring/bot-metrics.module';
import { HeartbeatModule } from '../monitoring/heartbeat/heartbeat.module';
import { BotCoPresenceScheduler } from './bot-co-presence.scheduler';
import { BotHealthSnapshotScheduler } from './bot-health-snapshot.scheduler';

@Module({
  imports: [DiscordModule.forFeature(), HeartbeatModule, BotMetricsModule],
  providers: [BotCoPresenceScheduler, BotHealthSnapshotScheduler],
})
export class BotSchedulerModule {}
