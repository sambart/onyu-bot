import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { BotApiClientModule } from '@onyu/bot-api-client';
import { type IncomingMessage } from 'http';
import { LoggerModule } from 'nestjs-pino';

import { BotCommandModule } from './command/bot-command.module';
import { resolveBotApiOptions } from './config/bot-api.config';
import { DiscordConfig } from './config/discord.config';
import { BotEventModule } from './event/bot-event.module';
import { BotMetricsModule } from './monitoring/bot-metrics.module';
import { InteractionDiagnosticsModule } from './monitoring/interaction-diagnostics/interaction-diagnostics.module';
import { BotSchedulerModule } from './scheduler/bot-scheduler.module';

const METRICS_PATH = '/metrics';
// compose healthcheck(15초 간격, F-MONITORING-039)가 반복 호출하는 경로 — 로그 잡음 방지
const HEALTH_PATH = '/health';
const HEALTH_LIVENESS_PATH = '/health/liveness';
const AUTO_LOGGING_IGNORED_PATHS: readonly string[] = [
  METRICS_PATH,
  HEALTH_PATH,
  HEALTH_LIVENESS_PATH,
];

@Module({
  imports: [
    // 네이티브 실행 시 cwd가 apps/bot이므로 모노레포 루트의 .env를 명시적으로 지정
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get('NODE_ENV') === 'production';
        return {
          pinoHttp: {
            level: isProduction ? 'info' : 'debug',
            autoLogging: {
              ignore: (req: IncomingMessage) => AUTO_LOGGING_IGNORED_PATHS.includes(req.url ?? ''),
            },
            ...(isProduction
              ? {}
              : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
          },
        };
      },
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DiscordModule.forRootAsync(DiscordConfig),
    BotApiClientModule.forRoot(resolveBotApiOptions(process.env)),
    BotEventModule,
    BotCommandModule,
    BotSchedulerModule,
    BotMetricsModule,
    InteractionDiagnosticsModule,
  ],
})
export class AppModule {}
