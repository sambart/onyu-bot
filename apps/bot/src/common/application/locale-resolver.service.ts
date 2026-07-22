import { Injectable } from '@nestjs/common';

const SUPPORTED_LOCALES = ['ko', 'en'];
const DEFAULT_LOCALE = 'en';

/**
 * Bot용 간소화된 locale 리졸버.
 * API의 LocaleResolverService는 DB/Redis를 사용하지만,
 * Bot에서는 디스코드 인터랙션의 locale만 참조한다.
 */
@Injectable()
export class LocaleResolverService {
  async resolve(
    _userId: string,
    _guildId: string | null,
    interactionLocale?: string,
  ): Promise<string> {
    if (interactionLocale) {
      const mapped = this.mapDiscordLocale(interactionLocale);
      if (mapped) return mapped;
    }
    return DEFAULT_LOCALE;
  }

  private mapDiscordLocale(discordLocale: string): string | null {
    const prefix = discordLocale.slice(0, 2).toLowerCase();
    return SUPPORTED_LOCALES.includes(prefix) ? prefix : null;
  }
}
