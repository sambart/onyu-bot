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

/** 카드 테마 프리셋 키 — 닫힌 enum. 신규 추가 시 BE `ME_CARD_THEMES`도 동반 갱신해야 한다. */
export type MeCardThemeKey = 'default' | 'sunset' | 'forest' | 'ocean' | 'mono';

/** 미지정/이상값 시 폴백 키(D4) — 현행 팔레트와 값이 완전히 동일해 렌더 결과가 바이트 동일하다. */
export const DEFAULT_ME_CARD_THEME: MeCardThemeKey = 'default';

/** 닫힌 enum 전체 목록 — BE 쿼리 검증·FE 스와치 렌더 순서의 단일 출처. */
export const ME_CARD_THEME_KEYS: readonly MeCardThemeKey[] = [
  'default',
  'sunset',
  'forest',
  'ocean',
  'mono',
] as const;

/**
 * 웹 스와치 칩 표시색 = 카드 배너 그라디언트 2색. API가 이 값을 그대로 배너 렌더에
 * 사용하므로(`ME_CARD_THEMES`), 색상 정의가 FE/BE 양쪽에 중복되지 않는다.
 */
export const ME_CARD_THEME_SWATCH: Record<MeCardThemeKey, { from: string; to: string }> = {
  default: { from: '#7C6FE0', to: '#5B8DEF' },
  sunset: { from: '#F97362', to: '#F5A623' },
  forest: { from: '#2E9E6B', to: '#7BC96F' },
  ocean: { from: '#1E88C7', to: '#4FD1C5' },
  mono: { from: '#4A4A4A', to: '#8A8A8A' },
};

/** BE 쿼리 검증(닫힌 enum) · FE 방어 공용 타입 가드. */
export function isMeCardThemeKey(value: unknown): value is MeCardThemeKey {
  return typeof value === 'string' && (ME_CARD_THEME_KEYS as readonly string[]).includes(value);
}
