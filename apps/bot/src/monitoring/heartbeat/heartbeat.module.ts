import { Module } from '@nestjs/common';

import { HeartbeatService } from './heartbeat.service';

/** bot 소비자가 co-presence scheduler 1개뿐이므로 전역 노출 없이 소비 모듈에만 provide+export. */
@Module({
  providers: [HeartbeatService],
  exports: [HeartbeatService],
})
export class HeartbeatModule {}
