import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import * as dotenv from 'dotenv';
import * as path from 'path';

const logger = new Logger('SentryProcessHook');

/** uncaughtException 종료 전 Sentry 이벤트 전송을 기다리는 최대 시간 */
const SENTRY_FLUSH_TIMEOUT_MS = 2000;

// 이 파일은 main.ts 최상단에서 import되어 NestFactory.create 이전(ConfigModule 로드 이전)에 실행된다.
// 로컬 dev는 process.cwd()가 apps/bot이라 Nest의 ConfigModule.forRoot(envFilePath: '../../.env')보다
// 먼저 process.env를 읽는 이 시점엔 루트 .env가 아직 로드되지 않으므로 직접 로드한다.
// prod(Docker)는 compose env_file로 process.env가 이미 채워져 있어, 존재하지 않는 경로를 가리켜도
// dotenv.config는 조용히 실패(에러 throw 없음)하고 기존 process.env 값도 override하지 않는다 — no-op.
dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

const dsn = process.env.SENTRY_DSN_BOT;

/**
 * `@sentry/node`가 기본 등록하는 OnUncaughtException/OnUnhandledRejection 통합 이름.
 * 아래 process 훅과 캡처가 중복되므로 defaultIntegrations에서 제외한다.
 */
const DUPLICATE_DEFAULT_INTEGRATION_NAMES = ['OnUncaughtException', 'OnUnhandledRejection'];

Sentry.init({
  dsn,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  // 무료 쿼터(5,000 에러/월) 보호 — 트레이싱은 사용하지 않는다
  tracesSampleRate: 0,
  // 최소 수집 원칙 — 사용자 식별자 등 기본 PII를 전송하지 않는다
  sendDefaultPii: false,
  enabled: Boolean(dsn),
  // 아래 커스텀 process 훅과 동일 이벤트를 두 번 캡처하지 않도록 SDK 기본 통합을 제외한다.
  // (기본 통합을 그대로 두면 이 파일의 훅이 "다른 핸들러 등록됨"으로 감지되어 SDK의 자체 종료
  // 로직만 비활성화될 뿐 캡처 자체는 계속 발생 — 크래시 1건당 이벤트 2건이 전송돼 무료 쿼터가 2배로 소진된다.)
  integrations: (defaultIntegrations) =>
    defaultIntegrations.filter(
      (integration) => !DUPLICATE_DEFAULT_INTEGRATION_NAMES.includes(integration.name),
    ),
});

// bot main.ts에는 전역 예외 필터·process 훅이 전무하므로(가장 취약), 여기서 안전망을 등록한다.
// 대다수 봇 핸들러가 이미 try/catch로 예외를 삼키므로 unhandledRejection에 잡히지 않는 경우가 많지만,
// 최후 방어선으로 process 전역 훅만 배선한다(핸들러 개별 캡처 배선은 범위 밖 — 후속 별도 항목).
// unhandledRejection: 핸들러 등록으로 Node 기본 크래시(v15+)를 의도적으로 무효화한다 —
// 일시적 외부 API 거부 때문에 gateway 세션을 재시작할 이유가 없으므로 캡처·로깅 후 계속 실행한다.
process.on('unhandledRejection', (reason) => {
  Sentry.captureException(reason);
  logger.error('Unhandled promise rejection', reason instanceof Error ? reason.stack : reason);
});

// uncaughtException: 캡처 후 Node 기본 크래시 시맨틱을 보존한다 — 핸들러만 등록하고 살려두면
// 프로세스가 미정의 상태로 남고 Docker restart 정책도 발동하지 않는다. 전송 flush 후 종료.
process.on('uncaughtException', (error) => {
  Sentry.captureException(error);
  logger.error('Uncaught exception', error.stack);
  void Sentry.close(SENTRY_FLUSH_TIMEOUT_MS).finally(() => process.exit(1));
});
