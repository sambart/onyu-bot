/**
 * 신고·권리침해 웹 접수(report-intake) 공유 상수 — API·web 이 같은 어휘/상한/전이표를 쓴다.
 * 정본: docs/plans/report-intake-form.md §3-1
 */

export const REPORT_TYPES = ['illegal_content', 'copyright_notice', 'counter_notice'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_STATUSES = [
  'received',
  'in_review',
  'needs_info',
  'actioned',
  'rejected',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_TERMINAL_STATUSES = [
  'actioned',
  'rejected',
] as const satisfies readonly ReportStatus[];

export const REPORT_TARGET_SURFACES = [
  'web_dashboard',
  'bot_card',
  'weekly_report',
  'other',
] as const;
export type ReportTargetSurface = (typeof REPORT_TARGET_SURFACES)[number];

export const REPORT_CLAIMANT_CAPACITIES = ['owner', 'agent'] as const;
export type ReportClaimantCapacity = (typeof REPORT_CLAIMANT_CAPACITIES)[number];

export const REPORT_NOTIFY_STATUSES = ['pending', 'sent', 'failed', 'dead', 'skipped'] as const;
export type ReportNotifyStatus = (typeof REPORT_NOTIFY_STATUSES)[number];

/** 철회 = rejected + 'withdrawn' (#9 전용 — #6 에서 수동 선택 불가) */
export const REPORT_RESOLUTION_CODES = [
  'content_removed',
  'feature_restricted',
  'restored',
  'no_violation',
  'insufficient_info',
  'duplicate',
  'spam',
  'withdrawn',
] as const;
export type ReportResolutionCode = (typeof REPORT_RESOLUTION_CODES)[number];

/** 운영자가 상태 전이(#6)에서 직접 고를 수 있는 처리 결과 코드 — `withdrawn` 제외 */
export const REPORT_MANUAL_RESOLUTION_CODES: readonly ReportResolutionCode[] =
  REPORT_RESOLUTION_CODES.filter((code) => code !== 'withdrawn');

export const REPORT_EVENT_TYPES = [
  'created',
  'status_changed',
  'memo_updated',
  'notified',
  'anonymized',
  'legal_hold_changed',
] as const;
export type ReportEventType = (typeof REPORT_EVENT_TYPES)[number];

/** 전이표 정본(F-004) — 재오픈(actioned/rejected → in_review) 포함. 익명화 행의 재오픈 차단은 서비스 책임(C5). */
export const REPORT_STATUS_TRANSITIONS: Readonly<Record<ReportStatus, readonly ReportStatus[]>> = {
  received: ['in_review', 'needs_info', 'rejected'],
  in_review: ['needs_info', 'actioned', 'rejected'],
  needs_info: ['in_review', 'rejected'],
  actioned: ['in_review'],
  rejected: ['in_review'],
};

export const REPORT_INTAKE_LIMITS = {
  reporterName: 100,
  contactEmail: 254,
  contactDiscord: 64,
  targetLocation: 1000,
  /** reason · justification · workDescription · authorityEvidence 공통 상한 */
  longText: 4000,
  representedParty: 100,
  electronicSignature: 100,
  relatedReceiptNo: 20,
  token: 256,
  honeypot: 200,
  internalMemo: 4000,
  resolutionNote: 4000,
  eventNote: 1000,
  legalHoldNote: 1000,
} as const;

export const REPORT_INTAKE_TIMING = { minFillSeconds: 8, tokenMaxAgeSeconds: 7200 } as const;

export const REPORT_RECEIPT_NO_PATTERN = /^RPT-\d{6}-[0-9A-HJKMNP-TV-Z]{6}$/;

/**
 * 허니팟 필드명 — 의미 없는 이름(Phase 3.5 edge-cases ❓-5: `website` 는 브라우저 자동완성 대상이라 금지).
 * 폼(web)과 인터셉터/DTO(api)가 같은 이름을 쓰도록 단일 소스로 둔다.
 */
export const REPORT_INTAKE_HONEYPOT_FIELD = 'hp_field_x';
