import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TOPGG_STATS_TIMEOUT_MS = 5000;

function buildStatsUrl(botId: string): string {
  return `https://top.gg/api/bots/${botId}/stats`;
}

/**
 * top.gg 봇 디렉토리 stats(서버 수) 전송 — docs/ops/growth-channels.md,
 * docs/reviews/topgg-listing-strategy.md §④·§⑥.
 *
 * `TOPGG_TOKEN` 미설정 시 완전 no-op(로컬/CI 에서 조용히 비활성) — koreanbots-stats-poster.service.ts
 * (apps/bot/src/monitoring/koreanbots-stats/koreanbots-stats-poster.service.ts) 관례와 동일. 전송 실패는
 * 예외를 전파하지 않고 warn 로깅만 한다(다음 주기 재시도로 자연 복구, 429도 동일 경로).
 *
 * top.gg는 요청 바디 필드명이 koreanbots와 다르다(`server_count`) — 봇은 ShardingManager 없이
 * 단일 프로세스로 동작하므로(discord.config.ts) shard_count는 생략한다.
 */
@Injectable()
export class TopggStatsPosterService {
  private readonly logger = new Logger(TopggStatsPosterService.name);
  private readonly token?: string;

  constructor(private readonly configService: ConfigService) {
    this.token = this.configService.get<string>('TOPGG_TOKEN');

    if (!this.token) {
      this.logger.log('[TOPGG] TOPGG_TOKEN 미설정 — stats 전송 비활성(no-op)');
    }
  }

  get isEnabled(): boolean {
    return Boolean(this.token);
  }

  /**
   * botId(봇 자신의 Discord user id) 기준 서버 수를 top.gg에 전송한다.
   * 토큰 미설정 시 no-op. 실패(비 2xx/네트워크 오류)는 warn 로깅만 하고 삼킨다.
   */
  async postStats(botId: string, servers: number): Promise<void> {
    if (!this.token) return;

    try {
      const response = await fetch(buildStatsUrl(botId), {
        method: 'POST',
        headers: {
          // top.gg는 Bearer 접두사 없이 토큰 원문을 그대로 Authorization 헤더에 사용한다.
          Authorization: this.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ server_count: servers }),
        signal: AbortSignal.timeout(TOPGG_STATS_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(`[TOPGG] stats 전송 실패 status=${response.status} servers=${servers}`);
        return;
      }

      this.logger.debug(`[TOPGG] stats 전송 성공 servers=${servers}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[TOPGG] stats 전송 중 오류: ${message}`);
    }
  }
}
