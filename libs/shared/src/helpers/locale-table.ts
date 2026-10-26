import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
  type Tier1Locale,
  type Tier2Locale,
  TRANSLATION_FALLBACK_LOCALE,
} from '../constants/locale';

/**
 * 로케일 테이블 입력 모양 — 1군은 필수, 2군은 선택.
 * 번역 도구가 추출하는 "단일 모양"이다(`defineLocaleTable(` 호출이 grep 가능한 추출 마커).
 */
export type LocaleTableInput<T> = { readonly [L in Tier1Locale]: T } & {
  readonly [L in Tier2Locale]?: T;
};

/** 값이 `undefined` 여도 "키가 있다"로 판정한다(`??` 는 의도적 undefined/null 을 en 으로 바꾸는 함정). */
function hasLocaleKey(source: object, locale: string): boolean {
  // lib ES2021 이라 Object.hasOwn(ES2022) 을 쓸 수 없다
  return Object.prototype.hasOwnProperty.call(source, locale);
}

/**
 * 지정한 로케일 목록 기준으로 누락 항목을 폴백(en) 값으로 채운다.
 * 계약: "키가 존재하는가"로 판정한다(`??` 아님) — 키가 있으면 값이 `undefined`/`null` 이어도 그대로 보존하고,
 * 키가 없을 때만 en 값으로 채운다. 1군은 필수 키라 항상 입력값 그대로다.
 * `defineLocaleTable` 의 구현체이며, 빈 2군 목록에서도 2군 경로를 검증할 수 있도록(가짜 로케일 주입 테스트)
 * 로케일 목록을 인자로 받는 형태로 분리했다. 앱 코드는 `defineLocaleTable` 을 쓴다.
 */
export function fillLocaleTable<T>(
  input: LocaleTableInput<T>,
  locales: readonly string[],
): Readonly<Record<string, T>> {
  const source = input as Readonly<Record<string, T>>;
  const fallback = source[TRANSLATION_FALLBACK_LOCALE]; // 1군 필수 키라 항상 존재
  return Object.fromEntries(
    locales.map((locale) => [locale, hasLocaleKey(source, locale) ? source[locale] : fallback]),
  );
}

/**
 * 누락된 2군 항목을 `TRANSLATION_FALLBACK_LOCALE`(en) 값으로 채운 완전 테이블을 돌려준다.
 * 반환 타입이 `Record<SupportedLocale, T>` 라 조회부(`TABLE[locale]`)는 수정 없이 타입 안전하다.
 * 1군 값은 입력의 참조를 그대로 유지한다(복제·병합 없음).
 * 계약: 키 존재 기준 — 1군 값이 의도적 `undefined`/`null` 이어도 보존한다(en 으로 바뀌지 않음).
 * 2군은 키가 없을 때만 en 으로 채우며, 키가 있으면 값이 `undefined` 여도 그대로 둔다.
 */
export function defineLocaleTable<const T>(
  input: LocaleTableInput<T>,
): Readonly<Record<SupportedLocale, T>> {
  // fillLocaleTable 은 키를 string 으로 넓힌다 — SUPPORTED_LOCALES 전수 순회라 SupportedLocale 키가 모두 존재
  return fillLocaleTable(input, SUPPORTED_LOCALES) as Record<SupportedLocale, T>;
}

/**
 * 인라인 1회성 분기용 — `isEn ? A : B` 를 대체한다.
 * 지원 로케일이면 해당 항목(2군 키 누락 시 en), 미지원 값은 en 항목으로 흡수한다.
 * 계약: 키 존재 기준 — 지원 로케일의 키가 있으면 값이 `undefined`/`null` 이어도 그대로 반환한다(`??` 폴백 없음).
 * 미지원 값을 ko 로 보내야 하는 지점은 `pickLocale(parseLocale(v, 'ko'), …)` 로 호출한다.
 * `supportedLocales` 는 테스트에서 가짜 2군을 주입하기 위한 선택 인자다(앱 코드는 생략).
 */
export function pickLocale<T>(
  locale: string,
  table: LocaleTableInput<T>,
  supportedLocales: readonly string[] = SUPPORTED_LOCALES,
): T {
  const source = table as Readonly<Record<string, T>>;
  const fallback = source[TRANSLATION_FALLBACK_LOCALE]; // 1군 필수 키라 항상 존재
  return supportedLocales.includes(locale) && hasLocaleKey(source, locale)
    ? source[locale]
    : fallback;
}
