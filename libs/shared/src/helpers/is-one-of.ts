/**
 * 문자열이 상수 배열의 멤버인지 판정하는 타입 가드.
 * `(CONST as readonly string[]).includes(x)` 관용구를 `as` 단언 없이 대체하고, true 분기에서 `x` 를 `T` 로 좁힌다.
 *
 * @param arr 멤버 후보 상수 배열 (`as const` 배열 권장)
 * @param x 판정 대상 문자열
 */
export function isOneOf<T extends string>(arr: readonly T[], x: string): x is T {
  // arr 의 원소 타입 T 가 string 의 부분 타입이라 `includes(x: T)` 에 string 을 직접 넘길 수 없다 — 좁히는 용도의 단일 단언
  return (arr as readonly string[]).includes(x);
}
