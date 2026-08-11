import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const KOREANBOTS_STATS_TIMEOUT_MS = 5000;

/** koreanbots.dev 는 discord.js v12/v13 대상 공식 SDK만 제공해 사용하지 않는다 — 전역 fetch로 직접 POST. */
function buildStatsUrl(botId: string): string {
  return `https://koreanbots.dev/api/v2/bots/${botId}/stats`;
}

/**
 * koreanbots.dev 봇 디렉토리 stats(서버 수) 전송 — docs/ops/growth-channels.md,
 * docs/reviews/topgg-listing-strategy.md §④·§⑥.
 * koreanbots 는 봇이 자기네 길드에 없으면 DB `updated_at`(stats 수신 시 갱신) 이 48시간
 * 이내인지로 온라인 여부를 판정하므로, 주기 전송으로 온라인 상태를 유지해야 한다.
 *
 * `KOREANBOTS_TOKEN` 미설정 시 완전 no-op(로컬/CI 에서 조용히 비활성) — heartbeat.service.ts
 * (apps/bot/src/monitoring/heartbeat/heartbeat.service.ts) 관례와 동일. 전송 실패는 예외를
 * 전파하지 않고 warn 로깅만 한다(다음 주기 재시도로 자연 복구, 429도 동일 경로).
 *
 * 향후 top.gg 등 타 디렉토리 추가 시, koreanbots 전용 URL/헤더 형식은 이 서비스에 격리된 채로
 * 병렬 포스터 서비스를 추가한다(과한 공용 추상화는 두지 않는다).
 */
@Injectable()
export class KoreanbotsStatsPosterService {
  private readonly logger = new Logger(KoreanbotsStatsPosterService.name);
  private readonly token?: string;

  constructor(private readonly configService: ConfigService) {
    this.token = this.configService.get<string>('KOREANBOTS_TOKEN');

    if (!this.token) {
      this.logger.log('[KOREANBOTS] KOREANBOTS_TOKEN 미설정 — stats 전송 비활성(no-op)');
    }
  }

  get isEnabled(): boolean {
    return Boolean(this.token);
  }

  /**
   * botId(봇 자신의 Discord user id) 기준 서버 수(+샤드 수)를 koreanbots에 전송한다.
   * 토큰 미설정 시 no-op. 실패(비 2xx/네트워크 오류)는 warn 로깅만 하고 삼킨다.
   */
  async postStats(botId: string, servers: number, shards: number): Promise<void> {
    if (!this.token) return;

    try {
      const response = await fetch(buildStatsUrl(botId), {
        method: 'POST',
        headers: {
          // koreanbots는 Bearer 접두사 없이 토큰 원문을 그대로 Authorization 헤더에 사용한다.
          Authorization: this.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ servers, shards }),
        signal: AbortSignal.timeout(KOREANBOTS_STATS_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(
          `[KOREANBOTS] stats 전송 실패 status=${response.status} servers=${servers}`,
        );
        return;
      }

      this.logger.debug(`[KOREANBOTS] stats 전송 성공 servers=${servers}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[KOREANBOTS] stats 전송 중 오류: ${message}`);
    }
  }
}
