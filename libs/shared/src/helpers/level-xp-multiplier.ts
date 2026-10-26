import {
  LEVEL_XP_MULTIPLIER_STEP_TOLERANCE,
  LEVEL_XP_MULTIPLIER_X10_MAX,
  LEVEL_XP_MULTIPLIER_X10_MIN,
} from '../constants/level-defaults';

const X10_SCALE = 10;
// web(target ES2017) 도 shared 소스를 컴파일하므로 BigInt 리터럴(`1n`) 대신 BigInt() 호출을 쓴다
const BIG_ZERO = BigInt(0);
const BIG_ONE = BigInt(1);

/** 소수 배율을 ×10 정수로 변환한다(`1.5` → `15`). */
export function toXpMultiplierX10(value: number): number {
  return Math.round(value * X10_SCALE);
}

/** 소수 표현으로 되돌리며 부동소수 잡음을 제거한다(`0.1+0.2` → `0.3`). */
export function normalizeXpMultiplier(value: number): number {
  return Math.round(value * X10_SCALE) / X10_SCALE;
}

/**
 * 배율 값 검증 — 유한 숫자 · 0.1 단위(오차 1e-6) · 0.1~5.0. 0 은 No-XP 기능이라 거부한다.
 * 서버 DTO 검증·웹 입력 검증 공용.
 */
export function isValidXpMultiplier(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }
  const x10 = toXpMultiplierX10(value);
  return (
    x10 >= LEVEL_XP_MULTIPLIER_X10_MIN &&
    x10 <= LEVEL_XP_MULTIPLIER_X10_MAX &&
    Math.abs(value * X10_SCALE - x10) < LEVEL_XP_MULTIPLIER_STEP_TOLERANCE
  );
}

/** 배율 목록 ID 와 No-XP 목록의 교집합(입력 순서, 중복 제거) — 서버 V6·웹 저장 차단 공용. */
export function findMultiplierNoXpConflicts(entryIds: string[], noXpIds: string[]): string[] {
  const noXpSet = new Set(noXpIds);
  return [...new Set(entryIds.filter((id) => noXpSet.has(id)))];
}

/** 여러 ×10 배율 중 최댓값(같은 타입 내 max 규칙, D1). 비어 있으면 `fallbackX10`(중립 10) 이다. */
export function pickMaxMultiplierX10(valuesX10: readonly number[], fallbackX10: number): number {
  return valuesX10.length === 0 ? fallbackX10 : Math.max(...valuesX10);
}

/** 채널 ×10 × 역할 ×10 결합 — 결과는 ×100 단위 정수다(`15 × 20 = 300` = 3.0배). 타입 간 곱 규칙(D1). */
export function combineXpMultipliersX100(channelX10: number, roleX10: number): number {
  return channelX10 * roleX10;
}

/**
 * 일 누적 텔레스코핑용 `f` — `x = base × numerator / denominator` 에 대해
 * `x > 0 ? max(1, floor(x)) : 0` (D5). BigInt 정확 정수 연산이라 부동소수 오차가 없다.
 * `base`/`numerator`/`denominator` 가 0 이하면 0 이다.
 * 델타는 호출측이 `f(누적T) - f(누적A)` 로 구한다 — tick 단위 최소 1 강제 금지.
 */
export function floorMinOneXp(
  base: number,
  numerator: bigint | number,
  denominator: bigint | number,
): number {
  const num = BigInt(numerator);
  const den = BigInt(denominator);
  if (base <= 0 || num <= BIG_ZERO || den <= BIG_ZERO) {
    return 0;
  }
  const floored = (BigInt(Math.trunc(base)) * num) / den;
  return Number(floored < BIG_ONE ? BIG_ONE : floored);
}
