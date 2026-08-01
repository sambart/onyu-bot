/** 봇·웹이 지원하는 로케일 (DB user_setting.locale / guild_setting.locale varchar(5)) */
export const SUPPORTED_LOCALES = ['ko', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]; // 'ko' | 'en'
export const DEFAULT_LOCALE: SupportedLocale = 'en';
