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
export type PremiumUnavailableReason = 'not_launched' | 'not_subscribed' | 'unavailable';

/** `resolvePremiumEntitlement()` 반환 타입. */
export interface PremiumEntitlementState {
  isEntitled: boolean;
  requiredTier: 'pro' | 'plus';
  reason: PremiumUnavailableReason | null;
}

/** 부여 출처. DB `entitlement.source` 컬럼 값과 1:1. */
export type EntitlementSource = 'paddle' | 'coupon' | 'comp_test' | 'grandfather';

/** DB `entitlement.status` 컬럼 값(행 상태). 판정 결과 `EntitlementStatus` 와 다른 개념이라 타입명을 분리한다. */
export type EntitlementRowStatus = 'active' | 'revoked';

/** 판정 결과 상태. `grace` 는 만료 후 유예 기간, `expired` 는 유효 행 없음 포함. */
export type EntitlementStatus = 'active' | 'grace' | 'expired';

/** `GET .../entitlements` 응답 — 주체 단위 판정 스냅샷. 날짜는 ISO 문자열. */
export interface EntitlementSnapshot {
  scope: PlanScope;
  tier: PlanTier;
  status: EntitlementStatus;
  endsAt: string | null;
  graceUntil: string | null;
  /** 해당 scope 의 카탈로그 키만 채운다(서버 판정 결과 — 클라이언트 독자 규칙 금지). */
  features: Partial<Record<PremiumFeatureKey, PremiumEntitlementState>>;
  evaluatedAt: string;
}

/** 플랜·주기 조합. Pro 는 길드 단위 월/연, Plus 는 개인 단위 N개월. */
export type PlanCycle =
  | { plan: 'pro'; cycle: 'month' | 'year' }
  | { plan: 'plus'; cycle: 1 | 3 | 6 | 12 };

/** Paddle Price 식별 키 = 플랜 주기 + 통화. */
export type PlanPriceKey = PlanCycle & { currency: 'KRW' | 'USD' };

/** 조회 기간 제한을 적용하는 표면. 표면별로 판정 주체(길드/개인)가 다르다. */
export type LookbackSurface = 'guild-dashboard' | 'my';

/** 표면·판정 상태별 조회 윈도우(일). */
export interface LookbackWindow {
  maxLookbackDays: number;
  defaultDays: number;
}

/** 조회 기간이 잘렸을 때 응답에 싣는 메타. */
export interface LookbackClampMeta {
  clamped: boolean;
  appliedFrom: string;
  maxLookbackDays: number;
}

// ── U7 Paddle 연동 (추가형 — 위 기존 심볼 불변) ──

/** Paddle.js·API env 값(`PADDLE_ENVIRONMENT`). DB 에는 `PaddleJournalEnvironment` 로 변환해 기록한다. */
export type PaddleEnvironment = 'sandbox' | 'production';

/** DB `paddle_webhook_event.environment`·`paddle_transaction_fee.environment` 값. `production` → `live`. */
export type PaddleJournalEnvironment = 'sandbox' | 'live';

/** DB `paddle_webhook_event.status` 컬럼 값. */
export type PaddleEventStatus = 'received' | 'processed' | 'skipped_stale' | 'deferred' | 'failed';

/** Pro(길드) Checkout intent 발급 요청 body. */
export interface GuildCheckoutIntentRequest {
  cycle: 'month' | 'year';
  currency: 'KRW' | 'USD';
}

/** Plus(개인) Checkout intent 발급 요청 body. */
export interface UserCheckoutIntentRequest {
  cycle: 1 | 3 | 6 | 12;
  currency: 'KRW' | 'USD';
}

/** Checkout intent 발급 응답. `intent` 는 서명된 불투명 토큰, `expiresAt` 은 ISO 문자열. */
export interface CheckoutIntentResponse {
  intent: string;
  priceId: string;
  expiresAt: string;
}

/** `GET /api/users/me/subscription/checkout-config` 응답 — 숨김 진입점 렌더 여부와 Paddle.js 초기화 값. */
export interface CheckoutConfigResponse {
  isAvailable: boolean;
  environment?: PaddleEnvironment;
  clientToken?: string;
}
