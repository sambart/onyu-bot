import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { BotMetricsController } from './bot-metrics.controller';
import { BotPrometheusService } from './bot-prometheus.service';
import { MetricsAuthGuard } from './metrics-auth.guard';

@Module({
  imports: [DiscordModule.forFeature()],
  controllers: [BotMetricsController],
  providers: [BotPrometheusService, MetricsAuthGuard],
  exports: [BotPrometheusService],
})
export class BotMetricsModule {}
