import { defineLocaleTable } from '../helpers/locale-table';
import type { PlanPriceKey } from '../types/subscription';
import type { PlusBadgeGrade, PlusTitleKey } from '../types/user-preference';

/** 만료 후 유예 일수. 정책: docs/specs/premium-policy.md §4.1 */
export const ENTITLEMENT_GRACE_DAYS = 7;

/**
 * Plus 배지 연속 구독 판정의 간극 허용 일수(U8-B3 K2·K6). 이전 구간 `endsAt` 과 다음 구간 `startsAt` 의 간격이
 * 이 값 이하면 이어붙인다. `ENTITLEMENT_GRACE_DAYS` 와 값만 일치할 뿐 **재사용하지 않는다** —
 * 유예 정책을 바꿔도 배지 연속성 기준이 함께 움직이지 않게 하려는 의도적 분리다.
 */
export const PLUS_BADGE_CONTINUITY_GAP_DAYS = 7;

/** Plus 배지 등급별 최소 경과 개월(UTC 완전 개월). 등급 1 은 가입 즉시(0). */
export const PLUS_BADGE_GRADE_MIN_MONTHS: Readonly<Record<PlusBadgeGrade, number>> = {
  1: 0,
  2: 3,
  3: 6,
  4: 12,
};

/** Plus 배지 등급명. 카드 렌더러(api)와 웹 표시 영역이 공유하는 단일 출처. */
export const PLUS_BADGE_GRADE_LABEL = defineLocaleTable<Record<PlusBadgeGrade, string>>({
  ko: { 1: '브론즈', 2: '실버', 3: '골드', 4: '플래티넘' },
  en: { 1: 'Bronze', 2: 'Silver', 3: 'Gold', 4: 'Platinum' },
  pt: { 1: 'Bronze', 2: 'Prata', 3: 'Ouro', 4: 'Platina' },
  ja: { 1: 'ブロンズ', 2: 'シルバー', 3: 'ゴールド', 4: 'プラチナ' },
});

/** Plus 칭호 라벨 8종. 길이 상한 ko·ja 6자 / en·pt 17자. */
export const PLUS_TITLE_LABEL = defineLocaleTable<Record<PlusTitleKey, string>>({
  ko: {
    stargazer: '별지기',
    lighthouse: '등대지기',
    navigator: '항해사',
    wanderer: '나그네',
    maestro: '마에스트로',
    ember: '온기지기',
    spotlight: '주인공',
    pathfinder: '길잡이',
  },
  en: {
    stargazer: 'Stargazer',
    lighthouse: 'Lighthouse Keeper',
    navigator: 'Navigator',
    wanderer: 'Wanderer',
    maestro: 'Maestro',
    ember: 'Ember Keeper',
    spotlight: 'Main Character',
    pathfinder: 'Pathfinder',
  },
  pt: {
    stargazer: 'Olhar Estelar',
    lighthouse: 'Faroleiro',
    navigator: 'Navegador',
    wanderer: 'Andarilho',
    maestro: 'Maestro',
    ember: 'Guardião da Brasa',
    spotlight: 'Protagonista',
    pathfinder: 'Desbravador',
  },
  ja: {
    stargazer: '星守り',
    lighthouse: '灯台守',
    navigator: '航海士',
    wanderer: '旅人',
    maestro: 'マエストロ',
    ember: 'ぬくもり守',
    spotlight: '主人公',
    pathfinder: '道しるべ',
  },
});

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
