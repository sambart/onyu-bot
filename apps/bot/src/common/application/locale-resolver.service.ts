import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { DEFAULT_LOCALE, isSupportedLocale } from '@onyu/shared';

/**
 * 저장된 user locale 조회 결과의 인메모리 캐시 TTL(ms).
 * 인터랙션마다 API 왕복(최대 1초)이 first-response 3초 데드라인을 잠식하는 문제(감사 A12 #8)를
 * 줄이되, 웹/다른 경로에서 언어를 바꾼 사용자가 오래 옛 언어를 보지 않도록 짧게 둔다.
 */
export const LOCALE_CACHE_TTL_MS = 30_000;

/** 캐시 상한 — 초과 시 만료분을 먼저 비우고, 그래도 넘치면 가장 오래된 항목부터 버린다 */
export const LOCALE_CACHE_MAX_ENTRIES = 5_000;

interface CachedStoredLocale {
  /** 조회에 성공한 저장값(미설정이면 null) — 오류는 절대 캐시하지 않는다 */
  stored: string | null;
  expiresAt: number;
}

/**
 * Bot용 locale 리졸버.
 * 우선순위: 1) 저장된 user locale(bot-api, F-GENERAL-005) 2) 디스코드 인터랙션 locale
 * 3) 기본값. 길드(서버) locale은 이 리졸버에 포함하지 않는다(F-GENERAL-004/005 불변 원칙 —
 * 서버 언어 설정은 웹 대시보드 전용이며 봇 응답 언어 결정에는 관여하지 않는다).
 *
 * 저장된 user locale 은 짧은 TTL 로 캐시한다. **조회 성공**(값 또는 "미설정")만 캐시하고,
 * 일시 오류는 캐시하지 않는다 — 오류는 "부재"가 아니므로 다음 인터랙션이 재조회해야 한다.
 */
@Injectable()
export class LocaleResolverService {
  private readonly logger = new Logger(LocaleResolverService.name);
  private readonly cache = new Map<string, CachedStoredLocale>();

  // BotApiClientModule.forRoot() 가 global: true 이므로 BotCommonModule 의 imports 변경 불필요.
  constructor(private readonly apiClient: BotApiClientService) {}

  async resolve(
    userId: string,
    _guildId: string | null,
    interactionLocale?: string,
  ): Promise<string> {
    // 1순위: 저장된 user locale (F-GENERAL-005) — 실패는 삼키고 폴백(요구동작 4)
    const stored = await this.getStoredLocale(userId);
    // 철회된 로케일 등 지원 목록 밖 저장값은 걸러 다음 순위로 폴백한다
    if (stored !== null && isSupportedLocale(stored)) return stored;

    // 2순위: interaction.locale (기존 로직 그대로)
    if (interactionLocale) {
      const mapped = this.mapDiscordLocale(interactionLocale);
      if (mapped) return mapped;
    }

    // 3순위: 기본값
    return DEFAULT_LOCALE;
  }

  /**
   * 사용자의 캐시를 비운다. 봇이 직접 user locale 을 저장한 직후(역할 패널 언어 선택 등)
   * 호출해, 다음 인터랙션이 TTL 동안 옛 언어를 읽지 않게 한다.
   */
  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  private mapDiscordLocale(discordLocale: string): string | null {
    const prefix = discordLocale.slice(0, 2).toLowerCase();
    return isSupportedLocale(prefix) ? prefix : null;
  }

  /** 저장된 locale 원문. 조회 실패 시 null 이며 이 경우 캐시에 기록하지 않는다. */
  private async getStoredLocale(userId: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > now) return cached.stored;

    try {
      const { locale } = await this.apiClient.getUserLocale(userId);
      const stored = locale ?? null;
      this.remember(userId, stored, now);
      return stored;
    } catch (error) {
      // nestjs-pino 는 메시지 뒤 위치 인자(err)를 버리므로 구조화 객체로 남긴다
      this.logger.warn({
        event: '[LOCALE] getUserLocale failed',
        userId,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private remember(userId: string, stored: string | null, now: number): void {
    if (this.cache.size >= LOCALE_CACHE_MAX_ENTRIES) this.evict(now);
    // delete 후 set 으로 삽입 순서를 갱신해 Map 순서 = 오래된 순서를 유지한다
    this.cache.delete(userId);
    this.cache.set(userId, { stored, expiresAt: now + LOCALE_CACHE_TTL_MS });
  }

  private evict(now: number): void {
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
    // 만료분만으로 부족하면 가장 오래된 항목부터 상한 아래로 내린다
    for (const key of this.cache.keys()) {
      if (this.cache.size < LOCALE_CACHE_MAX_ENTRIES) break;
      this.cache.delete(key);
    }
  }
}
