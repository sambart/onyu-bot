import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const HEALTHCHECKS_BASE_URL = 'https://hc-ping.com';
const HEARTBEAT_TIMEOUT_MS = 2500;

/**
 * Healthchecks.io 크론 heartbeat 유틸(bot) — `HEALTHCHECKS_PING_KEY` 미설정 시 완전 no-op.
 * api와 동형 — bot 소비자가 1개(co-presence scheduler)뿐이라 각 앱 로컬로 신설(공유 libs 미도입).
 * 본 기능을 절대 깨지 않는다 — ping 실패는 debug 로그만 남기고 삼킨다.
 */
@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);
  private readonly pingKey?: string;

  constructor(private readonly configService: ConfigService) {
    this.pingKey = this.configService.get<string>('HEALTHCHECKS_PING_KEY');
  }

  /** slug에 해당하는 크론 성공을 Healthchecks.io에 fire-and-forget으로 알린다. */
  ping(slug: string): void {
    if (!this.pingKey) return;

    void this.fire(this.pingKey, slug).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(`[HEARTBEAT] ping 실패 slug=${slug}: ${message}`);
    });
  }

  private async fire(pingKey: string, slug: string): Promise<void> {
    const url = `${HEALTHCHECKS_BASE_URL}/${pingKey}/${slug}`;
    await fetch(url, { signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS) });
  }
}
