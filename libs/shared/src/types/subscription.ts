/**
 * 프리미엄 플랜/entitlement 공유 계약 — U6(subscription 코어) 착수 전 선납 스텁.
 *
 * 본 파일은 `apps/api/src/subscription/domain/plan.types.ts`·`entitlement.types.ts`
 * (U6 가 만들 예정)의 **공유 계약 부분만** 먼저 정의한다. U6 는 이 파일을 확장하되
 * 기존 심볼을 바꾸지 않는다.
 *
 * 스텁 단계에서 `PremiumEntitlementState.isEntitled` 는 항상 `false` 이며, 판정 주체는
 * `apps/web/app/lib/entitlement.ts` 단 1곳이다(`resolvePremiumEntitlement`).
 *
 * 선례: `libs/shared/src/types/super-admin.ts` 의 `PremiumAdminConversion`
 * (`available:false` 고정 계약, subscription 엔티티 부재로 U6~U8 선행 필요).
 */

/** 플랜 티어. policy §1.1 3티어 정본과 1:1 — "sponsor"·"supporter" 등 후원 어휘 금지(D3). */
export type PlanTier = 'free' | 'pro' | 'plus';

/**
 * 플랜 적용 범위. Onyu Pro=`guild`, Onyu Plus=`user`(policy §1.1·§1.3).
 * entitlement(해금)와 authorization(열람 권한)이 별개 레이어라는 policy §6.1 불변 원칙을
 * 타입 수준에서 유지하기 위해, 본 타입에는 권한/스코프 개념을 일절 넣지 않는다.
 */
export type PlanScope = 'guild' | 'user';

/**
 * 잠금 대상 기능 키. 본 단위가 실제로 쓰는 2개 + 근접 예정 3개만 등재한다.
 * 미확정 혜택(배지 진화·칭호 등 게이트 보류분)은 넣지 않는다 —
 * 정의가 바뀌면 재작업이므로. **페르소나는 2026-08-12, 개인 AI 월간 리포트는 2026-08-31
 * D-lite 채택으로 각각 배제 사유가 소멸해 예외 등재했다**(`docs/plans/ai-persona-teaser.md`
 * D4 · `docs/plans/archive/monthly-report-teaser.md` D3). 확정 없는 항목을 이 선례로 끌어오지 말 것.
 */
export type PremiumFeatureKey =
  /** D4-3 — 개인 활동 1년 조회 */
  | 'personal.activityWindow.oneYear'
  /** D4-3 — 개인 활동 CSV 내보내기 */
  | 'personal.export.csv'
  /** D4-2 — 개인 카드 테마 (2번 단위 `me-card-theme` 가 소비. 키만 미리 등재해 단위 간 인터페이스를 고정) */
  | 'personal.card.theme'
  /** ai-persona-teaser D4 — 개인 AI 페르소나(말투) 적용. 세트·배치가 확정돼(✅1·✅2) 예외 등재됐다 */
  | 'personal.ai.persona'
  /** monthly-report-teaser D3 — 개인 AI 월간 리포트(D-lite 잠금 티저). 배치·기간이 확정돼 예외 등재됐다 */
  | 'personal.ai.monthlyReport';

/** `PremiumFeatureKey` → { scope, requiredTier } 단일 출처. 잠금 배지가 "Plus/Pro" 중 무엇을 표시할지 이 값으로 결정한다. */
export const PREMIUM_FEATURE_CATALOG: Record<
  PremiumFeatureKey,
  { scope: PlanScope; requiredTier: 'pro' | 'plus' }
> = {
  'personal.activityWindow.oneYear': { scope: 'user', requiredTier: 'plus' },
  'personal.export.csv': { scope: 'user', requiredTier: 'plus' },
  'personal.card.theme': { scope: 'user', requiredTier: 'plus' },
  'personal.ai.persona': { scope: 'user', requiredTier: 'plus' },
  'personal.ai.monthlyReport': { scope: 'user', requiredTier: 'plus' },
};

/**
 * 스텁 단계의 미해금 사유. `'not_launched'` 만 실제로 발생한다.
 * `PremiumAdminConversion.reason: string | null` 의 후속 개선형 — 문자열 대신 닫힌 유니온으로 좁힌다.
 */
export type PremiumUnavailableReason = 'not_launched' | 'not_subscribed';

/** `resolvePremiumEntitlement()` 반환 타입. */
export interface PremiumEntitlementState {
  isEntitled: boolean;
  requiredTier: 'pro' | 'plus';
  reason: PremiumUnavailableReason | null;
}
