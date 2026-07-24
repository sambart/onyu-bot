// Sentry 계측 + process 전역 훅은 앱 로드 전에 hooking 되어야 하므로 반드시 최상단에서 import한다
import './monitoring/sentry/instrument';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';

const DEFAULT_BOT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  // Bot은 HTTP 서버가 필요 없지만, health check 등을 위해 최소 포트 개방
  const port = process.env.BOT_PORT ?? DEFAULT_BOT_PORT;
  await app.listen(port);

  Logger.log(`Bot process started on port ${port}`);
}

bootstrap().catch((err: unknown) => {
  Sentry.captureException(err);
  Logger.error('Failed to start bot application', err);
  process.exit(1);
});
