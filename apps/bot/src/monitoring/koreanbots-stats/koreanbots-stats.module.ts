import { Module } from '@nestjs/common';

import { KoreanbotsStatsPosterService } from './koreanbots-stats-poster.service';

/** bot 소비자가 BotDirectoryStatsScheduler 1개뿐이므로 전역 노출 없이 소비 모듈에만 provide+export. */
@Module({
  providers: [KoreanbotsStatsPosterService],
  exports: [KoreanbotsStatsPosterService],
})
export class KoreanbotsStatsModule {}
