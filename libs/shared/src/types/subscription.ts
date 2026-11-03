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
  | 'personal.ai.monthlyReport'
  /** U8-B1 · F-SUB-032 — Pro 길드 활동 집계 CSV 내보내기(길드 스코프, 첫 길드 단위 혜택 게이트) */
  | 'guild.export.csv';

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
  'guild.export.csv': { scope: 'guild', requiredTier: 'pro' },
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
  /**
   * U8-A 해지 예약 표시(표시 전용 — 판정에 쓰지 않는다). 서버는 항상 채우지만 롤아웃 구간의 구 API 응답을
   * 받는 소비자를 위해 optional 로 둔다. `null` = 해당 없음(유효 행 없음·비-paddle 출처), `false` = 자동 갱신 중.
   * `status !== 'expired' && cancelAtPeriodEnd != null` 이면 선택된 유효 행이 paddle 출처다(웹 판별 규칙).
   */
  cancelAtPeriodEnd?: boolean | null;
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
  /** U8-A: Plus 12개월 런칭가 기간·해당 통화 할인이 설정된 경우에만 서버가 붙인다. 없으면 상시가. */
  discountId?: string;
}

/**
 * 플랜별 결제 표면 열림 여부. 로그인 응답(`checkout-config`)에서는 "이 사용자에게 보여도 되는가",
 * 무인증 `pricing-config.open` 에서는 "유효 모드가 public 인가" 를 뜻한다. 길드 관리 권한은 판정하지 않는다.
 */
export interface CheckoutPlanAvailability {
  pro: boolean;
  plus: boolean;
}

/** `GET /api/users/me/subscription/checkout-config` 응답 — 숨김 진입점 렌더 여부와 Paddle.js 초기화 값. */
export interface CheckoutConfigResponse {
  /** `plans.pro || plans.plus`. 하위호환 필드. */
  isAvailable: boolean;
  environment?: PaddleEnvironment;
  clientToken?: string;
  /** U8-A: 서버는 항상 채운다. 롤아웃 구간의 구 API 응답 대비로 optional(웹은 `plans ? plans[scope] : isAvailable`). */
  plans?: CheckoutPlanAvailability;
}

// ── U8-A 판매 표면 (추가형) ──

/** 무인증 `pricing-config` 의 Price 한 건 — 키(플랜·주기·통화) + Paddle Price ID. */
export type PricingPriceEntry = PlanPriceKey & { priceId: string };

/** Plus 12개월 런칭가 정보. 기간 내이고 할인 ID 가 1개 이상 설정됐을 때만 응답에 실린다. */
export interface PricingLaunchInfo {
  plan: 'plus';
  cycle: 12;
  discountIds: Partial<Record<'KRW' | 'USD', string>>;
  /** 종료 시각(ISO). 서버 판정 `now >= endsAt` 이면 종료. */
  endsAt: string;
}

/**
 * `GET /api/subscription/pricing-config` 응답(무인증·모드 불문). 비밀값은 싣지 않는다 —
 * client token 은 브라우저 노출 전제, Price/할인 ID 는 비밀이 아니다.
 */
export interface PricingConfigResponse {
  environment: PaddleEnvironment;
  /** 미설정이면 null — 웹은 PricePreview 를 건너뛰고 숫자 없는 폴백을 그린다. */
  clientToken: string | null;
  prices: PricingPriceEntry[];
  launch: PricingLaunchInfo | null;
  open: CheckoutPlanAvailability;
}
