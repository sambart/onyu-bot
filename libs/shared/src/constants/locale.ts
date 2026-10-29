/**
 * 로케일 tier 정본 (F-GENERAL-007).
 *
 * - 1군(`TIER1_LOCALES`): 모든 번역 키·코드 테이블이 완전해야 한다(패리티 테스트가 CI 에서 강제).
 * - 2군(`TIER2_LOCALES`): 누락 키/항목은 `TRANSLATION_FALLBACK_LOCALE`(en)로 폴백하고 누락은 리포트만 된다.
 *
 * 2군 로케일을 추가하는 절차는 `docs/plans/i18n-locale-tiering-generalization.md` §8-4 참조.
 */

/** 완전 패리티를 강제하는 1군 로케일. */
export const TIER1_LOCALES = ['ko', 'en'] as const;
/**
 * en 폴백을 허용하는 2군 로케일. pt(브라질 포르투갈어)는 A6 에서 봇 표면부터 투입한다.
 * ja(일본어)는 2026-10-28 1단계(봇)로 투입했다 — 웹은 2단계(`i18n-ja-web.md`, 2026-10), 공개 콘텐츠는 3단계(`i18n-ja-seo.md`)에서 노출했다.
 */
export const TIER2_LOCALES = ['pt', 'ja'] as const;

/** 봇·웹이 지원하는 로케일 (DB user_setting.locale / guild_setting.locale varchar(5)) */
export const SUPPORTED_LOCALES = [...TIER1_LOCALES, ...TIER2_LOCALES] as const;
export type Tier1Locale = (typeof TIER1_LOCALES)[number]; // 'ko' | 'en'
export type Tier2Locale = (typeof TIER2_LOCALES)[number]; // 'pt' | 'ja'
export type SupportedLocale = Tier1Locale | Tier2Locale; // 'ko' | 'en' | 'pt' | 'ja'
export const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * 2군 로케일의 누락 키/항목 폴백 대상. 타입이 `Tier1Locale` 이라
 * "폴백 대상은 항상 완전하다"는 불변식을 컴파일러가 보장한다.
 */
export const TRANSLATION_FALLBACK_LOCALE: Tier1Locale = 'en';

/**
 * 공개 콘텐츠(가이드·FAQ·랜딩) 경로가 존재할 수 있는 로케일. A8(2026-10)에 2군 pt, ja 는 3단계(2026-10, `i18n-ja-seo.md`)에 합류.
 * 실제 라우트 노출은 항목별 콘텐츠 가용성으로 결정된다(apps/web/app/_public-content/content-access.ts).
 *
 * `[...TIER1_LOCALES, ...TIER2_LOCALES]` 로 파생하지 않는다 — 다음 2군 언어는 봇(1단계)부터 들어오고
 * 3단계 전까지 공개 콘텐츠가 없으므로, `WEB_EXPOSED_LOCALES` 와 같은 "단계 분리 장치" 역할을 이 상수가 계속 한다.
 */
export const PUBLIC_CONTENT_LOCALES = ['ko', 'en', 'pt', 'ja'] as const;
export type PublicContentLocale = (typeof PUBLIC_CONTENT_LOCALES)[number];

/**
 * 각 언어의 자기 이름(endonym) — 로케일 선택 UI 의 2군 라벨용.
 * 1군 라벨은 기존 i18n 키를 유지하므로 이 상수는 2군에서만 쓰인다.
 * 2군이 추가됐는데 항목이 없으면 로케일 코드 자체로 폴백한다(= 기존 `getLocaleLabel` 폴백과 동일).
 */
const LOCALE_ENDONYM_ENTRIES: { readonly [L in Tier1Locale]: string } & {
  readonly [L in Tier2Locale]?: string;
} = { ko: '한국어', en: 'English', pt: 'Português', ja: '日本語' };

export const LOCALE_ENDONYMS: Readonly<Record<SupportedLocale, string>> = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    (LOCALE_ENDONYM_ENTRIES as Readonly<Record<string, string | undefined>>)[locale] ?? locale,
  ]),
) as Record<SupportedLocale, string>; // fromEntries 는 키를 string 으로 넓힌다 — SUPPORTED_LOCALES 전수 순회라 완전

/**
 * 임의 값이 지원 로케일인지 판정하는 타입 가드.
 * `SUPPORTED_LOCALES` 가 `as const`(readonly 튜플)라 `includes` 가 string 인자를 못 받는다 —
 * `readonly string[]` 로 좁힘만 해제하는 기존 관용구(proxy.ts:73, locale-resolver.service.ts)를 함수로 승격한다.
 */
export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * 웹 대시보드 표면(언어 스위처·Accept-Language 감지·NEXT_LOCALE 쿠키·서버 언어·역할 패널 태그·
 * 주간 리포트 언어)에 노출하는 로케일. A7(2026-10)부터 2군 pt 를 포함한다.
 * 2군은 웹 번역 배선(`libs/i18n/locales/{l}/web/` + `TIER2_PARTIAL_MESSAGES`)이 있어야만 넣는다 —
 * 다음 2군 언어가 봇부터 들어올 때는 이 집합에서 빼 두는 방식으로 웹 노출을 단계 분리한다.
 * 봇·api 는 SUPPORTED_LOCALES 전체를 쓴다.
 *
 * `TIER2_LOCALES` 로 파생하지 않는다 — 2군 중 웹 배선이 끝난 로케일만 둔다.
 * ja 는 2단계(`i18n-ja-web.md`, 2026-10)에서 합류했다.
 */
export const WEB_EXPOSED_LOCALES = [
  ...TIER1_LOCALES,
  'pt',
  'ja',
] as const satisfies readonly SupportedLocale[];
export type WebExposedLocale = (typeof WEB_EXPOSED_LOCALES)[number];

/** 임의 값이 웹에 노출되는 로케일인지 판정하는 타입 가드. */
export function isWebExposedLocale(value: unknown): value is WebExposedLocale {
  return typeof value === 'string' && (WEB_EXPOSED_LOCALES as readonly string[]).includes(value);
}

/** 임의 값이 1군(완전 패리티) 로케일인지 판정하는 타입 가드. */
export function isTier1Locale(value: unknown): value is Tier1Locale {
  return typeof value === 'string' && (TIER1_LOCALES as readonly string[]).includes(value);
}

/**
 * 공개 콘텐츠 경로가 없는 로케일(3단계 전 2군)을 `TRANSLATION_FALLBACK_LOCALE`(en)의 콘텐츠로 접는다.
 * 공개 로케일이면 자신을 그대로 돌려준다.
 */
export function toPublicContentLocale(locale: SupportedLocale): PublicContentLocale {
  return (PUBLIC_CONTENT_LOCALES as readonly string[]).includes(locale)
    ? (locale as PublicContentLocale) // includes 로 검증됨 — readonly string[] 비교라 좁힘이 안 될 뿐
    : TRANSLATION_FALLBACK_LOCALE;
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
