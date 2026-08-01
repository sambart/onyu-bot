import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@onyu/shared';

/**
 * Bot용 locale 리졸버.
 * 우선순위: 1) 저장된 user locale(bot-api, F-GENERAL-005) 2) 디스코드 인터랙션 locale
 * 3) 기본값. 길드(서버) locale은 이 리졸버에 포함하지 않는다(F-GENERAL-004/005 불변 원칙 —
 * 서버 언어 설정은 웹 대시보드 전용이며 봇 응답 언어 결정에는 관여하지 않는다).
 */
@Injectable()
export class LocaleResolverService {
  private readonly logger = new Logger(LocaleResolverService.name);

  // BotApiClientModule.forRoot() 가 global: true 이므로 BotCommonModule 의 imports 변경 불필요.
  constructor(private readonly apiClient: BotApiClientService) {}

  async resolve(
    userId: string,
    _guildId: string | null,
    interactionLocale?: string,
  ): Promise<string> {
    // 1순위: 저장된 user locale (F-GENERAL-005) — 실패는 삼키고 폴백(요구동작 4)
    try {
      const { locale } = await this.apiClient.getUserLocale(userId);
      if (locale) return locale;
    } catch (error) {
      this.logger.warn(`[LOCALE] getUserLocale failed: user=${userId}`, error);
    }

    // 2순위: interaction.locale (기존 로직 그대로)
    if (interactionLocale) {
      const mapped = this.mapDiscordLocale(interactionLocale);
      if (mapped) return mapped;
    }

    // 3순위: 기본값
    return DEFAULT_LOCALE;
  }

  private mapDiscordLocale(discordLocale: string): string | null {
    const prefix = discordLocale.slice(0, 2).toLowerCase();
    // `SUPPORTED_LOCALES`가 `as const`(readonly ['ko','en'])라 string 인자를 받는
    // `includes`와 타입이 맞지 않는다 — 좁힘만 해제(원소는 여전히 이 배열 값으로 검증됨).
    return (SUPPORTED_LOCALES as readonly string[]).includes(prefix) ? prefix : null;
  }
}
