import { Module } from '@nestjs/common';

import { BotI18nService } from './application/bot-i18n.service';
import { LocaleResolverService } from './application/locale-resolver.service';

/**
 * 봇 전역 공용 인프라(i18n, locale resolver)를 제공하는 모듈.
 * 커맨드 모듈과 이벤트 모듈이 이를 import하여 단일 인스턴스를 공유한다.
 */
@Module({
  providers: [BotI18nService, LocaleResolverService],
  exports: [BotI18nService, LocaleResolverService],
})
export class BotCommonModule {}
