import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BotApiClientService } from '@onyu/bot-api-client';

import { BotPrometheusService } from '../monitoring/bot-prometheus.service';

/**
 * 30초 간격으로 봇 헬스 스냅샷(게이트웨이 핑/길드 수/음성 접속자 수/uptime)을
 * API로 push한다(F-SUPER-ADMIN-016~018). API 측 Redis TTL(60s)이 dead-man
 * switch 역할을 하므로 별도 heartbeat는 두지 않는다. push 실패는 예외를
 * 전파하지 않고 다음 주기의 재시도로 자연 복구한다.
 */
@Injectable()
export class BotHealthSnapshotScheduler {
  private readonly logger = new Logger(BotHealthSnapshotScheduler.name);

  constructor(
    private readonly botPrometheusService: BotPrometheusService,
    private readonly apiClient: BotApiClientService,
  ) {}

  @Cron('*/30 * * * * *')
  pushSnapshot(): void {
    const snapshot = this.botPrometheusService.getSnapshot();

    this.apiClient.sendHealthSnapshot(snapshot).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to push health snapshot: ${message}`);
    });
  }
}
