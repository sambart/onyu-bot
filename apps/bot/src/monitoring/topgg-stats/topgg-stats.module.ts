import { Module } from '@nestjs/common';

import { TopggStatsPosterService } from './topgg-stats-poster.service';

/** bot 소비자가 BotDirectoryStatsScheduler 1개뿐이므로 전역 노출 없이 소비 모듈에만 provide+export. */
@Module({
  providers: [TopggStatsPosterService],
  exports: [TopggStatsPosterService],
})
export class TopggStatsModule {}
