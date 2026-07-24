import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { HeartbeatModule } from '../monitoring/heartbeat/heartbeat.module';
import { BotCoPresenceScheduler } from './bot-co-presence.scheduler';

@Module({
  imports: [DiscordModule.forFeature(), HeartbeatModule],
  providers: [BotCoPresenceScheduler],
})
export class BotSchedulerModule {}
