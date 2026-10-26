// 정본은 @onyu/shared/constants/locale — 여기서는 re-export만 한다 (CM-2 단일 출처 원칙).
export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  TIER1_LOCALES,
  TIER2_LOCALES,
  TRANSLATION_FALLBACK_LOCALE,
  PUBLIC_CONTENT_LOCALES,
  LOCALE_ENDONYMS,
  WEB_EXPOSED_LOCALES,
  isWebExposedLocale,
} from '@onyu/shared';
export type {
  SupportedLocale,
  Tier1Locale,
  Tier2Locale,
  PublicContentLocale,
  WebExposedLocale,
} from '@onyu/shared';
