import type { PlanPriceKey } from '../types/subscription';

/** 만료 후 유예 일수. 정책: docs/specs/premium-policy.md §4.1 */
export const ENTITLEMENT_GRACE_DAYS = 7;

/** 조회 윈도우(일). 정책: docs/specs/premium-policy.md §5 */
export const LOOKBACK_WINDOW_DAYS = {
  free: 90,
  defaultView: 365,
  // 365 x 5 근사 — 윤년 1일 차이는 "최근 5년" 정책 문구 범위 안
  max: 1825,
} as const;

/** 플랜·주기별 청구 개월 수. */
export const PLAN_PERIOD_MONTHS = {
  pro: { month: 1, year: 12 },
  plus: { 1: 1, 3: 3, 6: 6, 12: 12 },
} as const;

const PRICE_CURRENCIES = ['KRW', 'USD'] as const;
const PRO_CYCLES = ['month', 'year'] as const;
const PLUS_CYCLES = [1, 3, 6, 12] as const;

/** 판매 Price 전체 12종(Pro 4 + Plus 8). 런칭 한정가 별도 Price 여부는 U8 에서 결정. */
export const PLAN_PRICE_KEYS: readonly PlanPriceKey[] = [
  ...PRO_CYCLES.flatMap((cycle) =>
    PRICE_CURRENCIES.map((currency): PlanPriceKey => ({ plan: 'pro', cycle, currency })),
  ),
  ...PLUS_CYCLES.flatMap((cycle) =>
    PRICE_CURRENCIES.map((currency): PlanPriceKey => ({ plan: 'plus', cycle, currency })),
  ),
];

const PRO_CYCLE_SUFFIX = { month: 'MONTH', year: 'YEAR' } as const;

/**
 * Price 키 → 환경변수 이름. 규약 `PADDLE_PRICE_{PRO|PLUS}_{MONTH|YEAR|M1|M3|M6|M12}_{KRW|USD}`.
 * sandbox/live 구분은 이름이 아니라 배포 환경별 값으로 분리한다.
 */
export function buildPlanPriceEnvKey(key: PlanPriceKey): string {
  const plan = key.plan === 'pro' ? 'PRO' : 'PLUS';
  const cycle = key.plan === 'pro' ? PRO_CYCLE_SUFFIX[key.cycle] : `M${key.cycle}`;
  return `PADDLE_PRICE_${plan}_${cycle}_${key.currency}`;
}
