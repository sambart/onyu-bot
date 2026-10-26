import { LEVEL_CURVE_PARAMS_DEFAULTS } from '../constants/level-defaults';
import type { LevelCurveParams, LevelXpAdjustMode, RoleReward } from '../types/level';

/** 닫힌 식의 나눗셈 상수(등차수열 합/제곱합 공식) */
const SUM_OF_SQUARES_DIVISOR = 6;
const SUM_OF_INTEGERS_DIVISOR = 2;

/**
 * 레벨 n 도달에 필요한 누적 XP(닫힌 식). level<=0이면 0.
 *
 * 곡선 의미(F-LVL-02, 증분형): 레벨 n → n+1 증분 XP = a·n² + b·n + c (n=0부터).
 *   total(n) = a·(n-1)n(2n-1)/6 + b·(n-1)n/2 + c·n  (n≥1, total(0)=0)
 * 기본 계수 {a:2,b:20,c:100} 기준 검증값: total(1)=100 / total(10)=2,470 /
 * total(50)=110,350 / total(100)=765,700.
 * api(LevelService)와 웹 미리보기가 같은 식을 쓰도록 shared 에 둔다.
 */
export function computeLevelRequiredXp(level: number, params: LevelCurveParams): number {
  if (level <= 0) return 0;

  const n = level;
  const { a, b, c } = params;
  const sumOfSquares = ((n - 1) * n * (2 * n - 1)) / SUM_OF_SQUARES_DIVISOR;
  const sumOfIntegers = ((n - 1) * n) / SUM_OF_INTEGERS_DIVISOR;

  return a * sumOfSquares + b * sumOfIntegers + c * n;
}

/**
 * 누적 xp로부터 현재 레벨(최대 도달 레벨 n)을 판정한다. 하드캡 없음.
 *
 * 방어(결함 10-9) — `params`가 비정상(예: `{a:0,b:0,c:0}`)이면 requiredXp 가 항상 0이라
 * 루프가 무한히 돈다. 레벨을 1 올렸는데도 "다음 레벨 필요 XP"가 증가하지 않으면(정체)
 * 시스템 기본 계수로 1회 재판정한다 — 기본 계수는 항상 단조증가라 재귀는 1회로 끝난다.
 */
export function computeLevelFromXp(xp: number, params: LevelCurveParams): number {
  return resolveLevelFromXp(xp, params, false);
}

function resolveLevelFromXp(
  xp: number,
  params: LevelCurveParams,
  isFallbackAttempt: boolean,
): number {
  let level = 0;
  let requiredXpForNextLevel = computeLevelRequiredXp(1, params);

  while (xp >= requiredXpForNextLevel) {
    level += 1;
    const requiredXpForFollowingLevel = computeLevelRequiredXp(level + 1, params);

    if (requiredXpForFollowingLevel <= requiredXpForNextLevel) {
      if (isFallbackAttempt) return level; // 기본 계수마저 정체된 경우(있을 수 없음) 안전 종료
      return resolveLevelFromXp(xp, LEVEL_CURVE_PARAMS_DEFAULTS, true);
    }

    requiredXpForNextLevel = requiredXpForFollowingLevel;
  }

  return level;
}

/**
 * 수동 조정 결과 xp (F-LVL-34).
 * add: before+amount / remove: max(0, before-amount) / set: amount.
 * `isClamped` 는 remove 가 0 하한에 걸려 요청량보다 적게 차감된 경우만 true.
 */
export function computeXpAdjustment(
  mode: LevelXpAdjustMode,
  amount: number,
  xpBefore: number,
): { xpAfter: number; isClamped: boolean } {
  if (mode === 'add') return { xpAfter: xpBefore + amount, isClamped: false };
  if (mode === 'set') return { xpAfter: amount, isClamped: false };

  return { xpAfter: Math.max(0, xpBefore - amount), isClamped: amount > xpBefore };
}

/**
 * (fromLevel, toLevel] 구간에 새로 도달한 보상(건너뛴 중간 레벨 포함, F-LVL-04 규칙).
 * toLevel<=fromLevel 이면 빈 배열.
 */
export function findUnlockedRoleRewards(
  roleRewards: readonly RoleReward[],
  fromLevel: number,
  toLevel: number,
): RoleReward[] {
  if (toLevel <= fromLevel) return [];

  return roleRewards.filter((reward) => reward.level > fromLevel && reward.level <= toLevel);
}
