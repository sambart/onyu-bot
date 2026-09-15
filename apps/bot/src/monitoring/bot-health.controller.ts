import { InjectDiscordClient } from '@discord-nestjs/core';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Client } from 'discord.js';

const MIN_PING_MS = 0;

/**
 * GET /health(/liveness) — 봇 컨테이너용 헬스체크 엔드포인트(F-MONITORING-039).
 *
 * 왜 무인증인가: `apps/bot` 컨테이너는 `docker-compose.prod.yml` 에 `ports`/`expose` 가
 * 없어 도커 내부망(같은 compose 네트워크)에서만 접근 가능하다 — 인터넷에 노출되지 않으므로
 * `GET /metrics`(MetricsAuthGuard) 와 달리 인증을 요구하지 않는다.
 *
 * 왜 Discord readiness = liveness 로 보지 않는가: `/health` 는 `client.isReady()` 를
 * "이 프로세스가 봇 기능을 실제로 수행할 수 있는가"(readiness)로 판정한다 — Discord 게이트웨이가
 * 끊긴 봇은 슬래시 커맨드·이벤트 처리가 전부 불가능해 죽은 것과 동일하기 때문이다. 반면
 * `/health/liveness` 는 항상 200 을 반환해 프로세스 생존만 본다(apps/api 의 동일 경로와 대칭).
 * compose healthcheck + willfarrell/autoheal 은 `/health` 를 사용한다(F-MONITORING-038 편입).
 */
@Controller('health')
export class BotHealthController {
  constructor(@InjectDiscordClient() private readonly client: Client) {}

  /** GET /health — Discord 게이트웨이 readiness. 미준비 시 503(ServiceUnavailableException). */
  @Get()
  check(): { status: 'ok'; discord: { ready: true; ping: number } } {
    if (!this.client.isReady()) {
      throw new ServiceUnavailableException({
        status: 'error',
        discord: { ready: false },
      });
    }

    return {
      status: 'ok',
      discord: { ready: true, ping: Math.max(this.client.ws.ping, MIN_PING_MS) },
    };
  }

  /** GET /health/liveness — 프로세스 alive 확인(Discord 상태와 무관, apps/api 와 대칭) */
  @Get('liveness')
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
