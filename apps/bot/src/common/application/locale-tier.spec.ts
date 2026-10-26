/**
 * 로케일 tier 상수·테이블 헬퍼(`@onyu/shared`) 단위 테스트 (F-GENERAL-007).
 *
 * shared 는 자체 테스트 러너가 없어 i18n 자산의 테스트를 소유한 봇 프로젝트에 둔다.
 * 실제 `TIER2_LOCALES` 가 빈 목록이어도 2군 경로가 검증되도록 가짜 로케일 `xx` 를 주입한다.
 */
import {
  defineLocaleTable,
  fillLocaleTable,
  isSupportedLocale,
  isTier1Locale,
  LOCALE_ENDONYMS,
  type LocaleTableInput,
  pickLocale,
  PUBLIC_CONTENT_LOCALES,
  SUPPORTED_LOCALES,
  type SupportedLocale,
  TIER1_LOCALES,
  TIER2_LOCALES,
  toPublicContentLocale,
  TRANSLATION_FALLBACK_LOCALE,
} from '@onyu/shared';
import { describe, expect, it } from 'vitest';

/** 가짜 2군 로케일 — 타입상 never 라 `as unknown as` 로 주입한다. */
const FAKE_TIER2 = 'xx';

function withFakeTier2<T>(ko: T, en: T, xx?: T): LocaleTableInput<T> {
  return (xx === undefined
    ? { ko, en }
    : { ko, en, [FAKE_TIER2]: xx }) as unknown as LocaleTableInput<T>;
}

describe('tier 상수', () => {
  it('SUPPORTED_LOCALES 는 1군 + 2군이며 1군은 ko·en 이다', () => {
    expect([...SUPPORTED_LOCALES]).toEqual([...TIER1_LOCALES, ...TIER2_LOCALES]);
    expect([...TIER1_LOCALES]).toEqual(['ko', 'en']);
  });

  it('폴백 로케일은 1군이고 공개 콘텐츠 로케일은 ko·en·pt 이다(A8)', () => {
    expect(TIER1_LOCALES).toContain(TRANSLATION_FALLBACK_LOCALE);
    expect([...PUBLIC_CONTENT_LOCALES]).toEqual(['ko', 'en', 'pt']);
  });

  it('LOCALE_ENDONYMS 는 모든 지원 로케일의 라벨을 가진다', () => {
    expect(LOCALE_ENDONYMS.ko).toBe('한국어');
    expect(LOCALE_ENDONYMS.en).toBe('English');
    for (const locale of SUPPORTED_LOCALES) {
      expect(LOCALE_ENDONYMS[locale]).toBeTruthy();
    }
  });
});

describe('isTier1Locale / isSupportedLocale', () => {
  it('1군만 isTier1Locale 을 통과한다', () => {
    expect(isTier1Locale('ko')).toBe(true);
    expect(isTier1Locale('en')).toBe(true);
    expect(isTier1Locale(FAKE_TIER2)).toBe(false);
    expect(isTier1Locale(undefined)).toBe(false);
  });

  it('미지원 값은 isSupportedLocale 을 통과하지 못한다', () => {
    expect(isSupportedLocale('ko')).toBe(true);
    // 가짜 로케일 'xx' 는 실제 2군(pt)이 투입돼도 지원 대상이 아니다
    expect(isSupportedLocale(FAKE_TIER2)).toBe(false);
    expect(isSupportedLocale('pt')).toBe(TIER2_LOCALES.some((l) => l === 'pt'));
    expect(isSupportedLocale(null)).toBe(false);
  });
});

describe('defineLocaleTable', () => {
  it('1군 값을 입력 참조 그대로 돌려준다', () => {
    const ko = { label: '안녕' };
    const en = { label: 'Hello' };
    const table = defineLocaleTable({ ko, en });
    expect(table.ko).toBe(ko);
    expect(table.en).toBe(en);
    expect(Object.keys(table).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it('2군 로케일 목록을 주입하면 누락 항목은 en 값으로 채우고 존재 항목은 보존한다', () => {
    const locales = [...SUPPORTED_LOCALES, FAKE_TIER2, 'yy'];
    const table = fillLocaleTable(withFakeTier2('가', 'a', 'x'), locales);
    expect(table.ko).toBe('가');
    expect(table.en).toBe('a');
    expect(table[FAKE_TIER2]).toBe('x'); // 2군 자체 값 보존
    expect(table.yy).toBe('a'); // 2군 누락 → en 폴백
  });

  it('1군 값이 의도적 undefined/null 이어도 en 으로 바뀌지 않고 보존한다', () => {
    const withUndefined = defineLocaleTable<string | undefined>({ ko: undefined, en: 'a' });
    expect(withUndefined.ko).toBeUndefined();
    expect(withUndefined.en).toBe('a');
    const withNull = defineLocaleTable<string | null>({ ko: null, en: 'a' });
    expect(withNull.ko).toBeNull();
  });

  it('2군은 키 부재 → en, 키 존재(값 undefined 포함) → 입력 그대로(키 존재 기준)', () => {
    const locales = [...SUPPORTED_LOCALES, FAKE_TIER2, 'yy'];
    const input = { ko: '가', en: 'a', [FAKE_TIER2]: undefined } as unknown as LocaleTableInput<
      string | undefined
    >;
    const table = fillLocaleTable(input, locales);
    expect(table[FAKE_TIER2]).toBeUndefined(); // 키는 있으나 값 undefined — 보존
    expect(table.yy).toBe('a'); // 키 부재 — en 폴백
  });

  it('지원 목록 밖의 키는 결과에 포함되지 않는다', () => {
    const table = defineLocaleTable(withFakeTier2('가', 'a', 'x')) as Record<string, string>;
    expect(FAKE_TIER2 in table).toBe(isSupportedLocale(FAKE_TIER2));
  });

  it('조회부 TABLE[locale] 은 모든 지원 로케일에서 값을 돌려준다', () => {
    const table = defineLocaleTable({ ko: '가', en: 'a' });
    for (const locale of SUPPORTED_LOCALES satisfies readonly SupportedLocale[]) {
      expect(table[locale]).toBeDefined();
    }
  });
});

describe('pickLocale', () => {
  const table = withFakeTier2('가', 'a');

  it('1군은 해당 항목을 돌려준다', () => {
    expect(pickLocale('ko', table)).toBe('가');
    expect(pickLocale('en', table)).toBe('a');
  });

  it('미지원 값은 en 항목으로 흡수한다', () => {
    expect(pickLocale('fr', table)).toBe('a');
    expect(pickLocale('', table)).toBe('a');
  });

  it('2군 로케일이 지원 목록에 있으면 2군 항목, 항목이 없으면 en 으로 폴백한다', () => {
    const supported = [...SUPPORTED_LOCALES, FAKE_TIER2];
    expect(pickLocale(FAKE_TIER2, withFakeTier2('가', 'a', 'x'), supported)).toBe('x');
    expect(pickLocale(FAKE_TIER2, table, supported)).toBe('a');
  });

  it('지원 로케일의 값이 undefined 면 en 으로 바꾸지 않고 그대로 반환한다', () => {
    const input = { ko: undefined, en: 'a' } as LocaleTableInput<string | undefined>;
    expect(pickLocale('ko', input)).toBeUndefined();
    expect(pickLocale('fr', input)).toBe('a'); // 미지원은 여전히 en
  });

  it('지원 목록 밖의 값은 2군 항목이 있어도 en 이다', () => {
    expect(pickLocale(FAKE_TIER2, withFakeTier2('가', 'a', 'x'), SUPPORTED_LOCALES)).toBe(
      isSupportedLocale(FAKE_TIER2) ? 'x' : 'a',
    );
  });
});

describe('toPublicContentLocale', () => {
  it('공개 콘텐츠가 있는 로케일은 그대로 돌려준다', () => {
    expect(toPublicContentLocale('ko')).toBe('ko');
    expect(toPublicContentLocale('en')).toBe('en');
    expect(toPublicContentLocale('pt')).toBe('pt');
  });

  it('공개 콘텐츠가 없는 로케일(2군)은 en 으로 접는다', () => {
    expect(toPublicContentLocale(FAKE_TIER2 as unknown as SupportedLocale)).toBe('en');
  });
  it('공개 콘텐츠 로케일 목록의 모든 값은 자기 자신으로 유지된다', () => {
    for (const locale of PUBLIC_CONTENT_LOCALES) {
      expect(toPublicContentLocale(locale)).toBe(locale);
    }
  });

  it('반환값은 항상 PUBLIC_CONTENT_LOCALES 에 속한다', () => {
    for (const locale of [...SUPPORTED_LOCALES, FAKE_TIER2 as unknown as SupportedLocale]) {
      expect(PUBLIC_CONTENT_LOCALES as readonly string[]).toContain(toPublicContentLocale(locale));
    }
  });
});

describe('isTier1Locale 경계값', () => {
  it.each([[''], ['KO'], ['ko-KR'], [' en'], [null], [undefined], [0], [{}]])(
    '%j 은 1군이 아니다',
    (value) => {
      expect(isTier1Locale(value)).toBe(false);
    },
  );

  it('가짜 2군(xx)은 isTier1Locale·isSupportedLocale 모두 통과하지 못한다(현재 2군 목록이 비어 있음)', () => {
    expect(isTier1Locale(FAKE_TIER2)).toBe(false);
    expect(isSupportedLocale(FAKE_TIER2)).toBe(false);
  });
});
