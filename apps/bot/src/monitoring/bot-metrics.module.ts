import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { BotHealthController } from './bot-health.controller';
import { BotMetricsController } from './bot-metrics.controller';
import { BotPrometheusService } from './bot-prometheus.service';
import { MetricsAuthGuard } from './metrics-auth.guard';

@Module({
  imports: [DiscordModule.forFeature()],
  controllers: [BotMetricsController, BotHealthController],
  providers: [BotPrometheusService, MetricsAuthGuard],
  exports: [BotPrometheusService],
})
export class BotMetricsModule {}
