/** 봇·웹이 지원하는 로케일 (DB user_setting.locale / guild_setting.locale varchar(5)) */
export const SUPPORTED_LOCALES = ['ko', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]; // 'ko' | 'en'
export const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * 임의 값이 지원 로케일인지 판정하는 타입 가드.
 * `SUPPORTED_LOCALES` 가 `as const`(readonly 튜플)라 `includes` 가 string 인자를 못 받는다 —
 * `readonly string[]` 로 좁힘만 해제하는 기존 관용구(middleware.ts:73, locale-resolver.service.ts)를 함수로 승격한다.
 */
export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** 지원 로케일이면 그대로, 아니면 `fallback`(기본 `DEFAULT_LOCALE`)을 돌려준다. */
export function parseLocale(
  value: unknown,
  fallback: SupportedLocale = DEFAULT_LOCALE,
): SupportedLocale {
  return isSupportedLocale(value) ? value : fallback;
}

/** null/undefined 를 보존하는 판정 — `localeTag` 계열(미지정=null 이 의미를 갖는 필드)용. */
export function parseNullableLocale(value: unknown): SupportedLocale | null {
  return isSupportedLocale(value) ? value : null;
}
