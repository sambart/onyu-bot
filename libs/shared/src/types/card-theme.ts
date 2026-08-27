/**
 * `/me` 프로필 카드 커스텀 테마 — voice 도메인 카드 렌더 계약(D1).
 *
 * `subscription.ts`(entitlement 계약 — U6 선납분)와는 축이 다르다: `personal.card.theme`
 * **feature key**(잠금 판정)는 `subscription.ts`에, 테마 **프리셋 키**(렌더 계약)는 본 파일에
 * 둔다. 도메인 소유권 분쟁을 피하기 위해 `subscription.ts`를 확장하지 않는다.
 *
 * 클라이언트는 항상 키만 전달한다 — 실제 색 값(렌더 팔레트)은 API 서버 상수
 * (`apps/api/src/channel/voice/application/card-theme.ts`)이며 클라이언트가 자유 색상을
 * 주입할 수 없다(프롬프트 인젝션 금지 원칙과 동일 계열, 영구 정책).
 *
 * 진실의 소스: docs/plans/me-card-theme.md §4 D1/D2
 */

/**
 * 닫힌 enum 전체 목록 — BE 쿼리 검증·FE 스와치 렌더 순서의 단일 출처.
 *
 * `MeCardThemeKey` 유니온은 이 배열에서 파생된다(양방향 포함 구조 보장 — 유니온에만
 * 추가하고 배열에서 빠뜨리는 침묵 실패를 컴파일 에러로 승격, me-card-theme-expansion D-5 #1).
 * 신규 추가 시 BE `ME_CARD_THEMES`도 동반 갱신해야 한다.
 */
export const ME_CARD_THEME_KEYS = [
  'default',
  'sunset',
  'forest',
  'ocean',
  'lavender',
  'rose',
  'gold',
  'mono',
  'slate',
  'sand',
] as const;

/** 카드 테마 프리셋 키 — 닫힌 enum. `ME_CARD_THEME_KEYS`에서 파생. */
export type MeCardThemeKey = (typeof ME_CARD_THEME_KEYS)[number];

/** 미지정/이상값 시 폴백 키(D4) — 현행 팔레트와 값이 완전히 동일해 렌더 결과가 바이트 동일하다. */
export const DEFAULT_ME_CARD_THEME: MeCardThemeKey = 'default';

/**
 * 웹 스와치 칩 표시색 = 카드 배너 그라디언트 2색. API가 이 값을 그대로 배너 렌더에
 * 사용하므로(`ME_CARD_THEMES`), 색상 정의가 FE/BE 양쪽에 중복되지 않는다.
 */
export const ME_CARD_THEME_SWATCH: Record<MeCardThemeKey, { from: string; to: string }> = {
  default: { from: '#7C6FE0', to: '#5B8DEF' },
  sunset: { from: '#F97362', to: '#F5A623' },
  forest: { from: '#2E9E6B', to: '#7BC96F' },
  ocean: { from: '#1E88C7', to: '#4FD1C5' },
  lavender: { from: '#A46FE8', to: '#D0AEF2' },
  rose: { from: '#F2628F', to: '#F9A8C4' },
  gold: { from: '#D9A21C', to: '#F2D678' },
  mono: { from: '#4A4A4A', to: '#8A8A8A' },
  slate: { from: '#4E5D72', to: '#93A3B5' },
  sand: { from: '#B98F5F', to: '#E3CBA3' },
};

/** BE 쿼리 검증(닫힌 enum) · FE 방어 공용 타입 가드. */
export function isMeCardThemeKey(value: unknown): value is MeCardThemeKey {
  return typeof value === 'string' && (ME_CARD_THEME_KEYS as readonly string[]).includes(value);
}

/** 셀렉터 표시 그룹핑 전용 — API 계약에는 존재하지 않는다(서버로 전송되지 않음). */
export type MeCardThemeCategory = 'basic' | 'color' | 'monotone';

/** 카테고리 표시 순서 — 기본 → 컬러 → 모노톤 (PRD F-VOICE-091 R3 고정). */
export const ME_CARD_THEME_CATEGORY_ORDER: readonly MeCardThemeCategory[] = [
  'basic',
  'color',
  'monotone',
] as const;

/** 카테고리 → 테마 키 배열. 배열 순서 = 그룹 내부 렌더 순서. */
export const ME_CARD_THEME_CATEGORIES: Readonly<
  Record<MeCardThemeCategory, readonly MeCardThemeKey[]>
> = {
  basic: ['default'],
  color: ['sunset', 'forest', 'ocean', 'lavender', 'rose', 'gold'],
  monotone: ['mono', 'slate', 'sand'],
};
