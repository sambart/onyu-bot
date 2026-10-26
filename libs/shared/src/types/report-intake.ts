import type { PublicContentLocale } from '../constants/locale';
import type {
  ReportClaimantCapacity,
  ReportEventType,
  ReportNotifyStatus,
  ReportResolutionCode,
  ReportStatus,
  ReportTargetSurface,
  ReportType,
} from '../constants/report-intake';
import { type REPORT_INTAKE_HONEYPOT_FIELD } from '../constants/report-intake';

/**
 * 신고·권리침해 웹 접수(report-intake) DTO 계약. 정본: docs/plans/report-intake-form.md §3-2,
 * docs/specs/endpoint-spec/report-intake.md.
 * 어느 타입에도 ip · ipHash · userAgent 필드를 두지 않는다(저장하지 않는 정보 — F-011).
 */

// ── 공개 API (#1 #2) ──

/** #1 GET /api/report-intake/form-token */
export interface ReportIntakeFormTokenResponse {
  token: string;
  minFillSeconds: number;
  expiresInSeconds: number;
}

/** #2 POST /api/report-intake/reports 본문 — 유형 외 필드는 서버가 무시한다 */
export interface ReportIntakeSubmitRequest {
  reportType: ReportType;
  locale: PublicContentLocale;
  token: string;
  /** 허니팟 — 사람은 비워 둔다. 필드명은 REPORT_INTAKE_HONEYPOT_FIELD */
  [REPORT_INTAKE_HONEYPOT_FIELD]?: string;
  consentAccepted: true;
  reporterName?: string;
  contactEmail?: string;
  contactDiscord?: string;
  targetLocation: string;
  /** 3유형 공통 필수 (C4) */
  targetSurface: ReportTargetSurface;
  // illegal_content
  reason?: string;
  isCsam?: boolean;
  // copyright_notice
  claimantCapacity?: ReportClaimantCapacity;
  representedParty?: string;
  workDescription?: string;
  authorityEvidence?: string;
  electronicSignature?: string;
  // counter_notice
  justification?: string;
  relatedReceiptNo?: string;
  // 진술
  statementGoodFaith: true;
  statementAccuracy?: true;
}

export interface ReportIntakeSubmitResponse {
  receiptNo: string;
  /** ISO 8601 */
  receivedAt: string;
}

// ── 어드민 목록 (#3 #4) ──

export interface AdminReportListQuery {
  /** CSV (예: `received,in_review`) */
  status?: string;
  type?: ReportType;
  from?: string;
  to?: string;
  notifyFailed?: 'true';
  cursor?: string;
  limit?: number;
}

/** 목록 항목 — PII · 자유 서술 컬럼 없음 */
export interface AdminReportListItem {
  id: string;
  receiptNo: string;
  reportType: ReportType;
  status: ReportStatus;
  targetSurface: ReportTargetSurface;
  isCsam: boolean;
  locale: PublicContentLocale;
  createdAt: string;
  handledAt: string | null;
  handledByDiscordUserId: string | null;
  notifyStatus: ReportNotifyStatus;
  legalHold: boolean;
  anonymizedAt: string | null;
}

export interface AdminReportListResponse {
  items: AdminReportListItem[];
  nextCursor: string | null;
}

export interface AdminReportSummary {
  receivedCount: number;
  notifyFailedCount: number;
}

// ── 어드민 상세 (#5~#7) ──

export interface RelatedReportSummary {
  id: string;
  receiptNo: string;
  reportType: ReportType;
  status: ReportStatus;
  resolutionCode: ReportResolutionCode | null;
  anonymizedAt: string | null;
}

export interface ReportEventView {
  id: string;
  eventType: ReportEventType;
  fromStatus: ReportStatus | null;
  toStatus: ReportStatus | null;
  actorDiscordUserId: string | null;
  note: string | null;
  createdAt: string;
}

export interface AdminReportDetail extends AdminReportListItem {
  // 제출자 (PII — 익명화 후 null)
  reporterName: string | null;
  contactEmail: string | null;
  contactDiscord: string | null;
  claimantCapacity: ReportClaimantCapacity | null;
  representedParty: string | null;
  electronicSignature: string | null;
  // 접수 내용 (익명화 후 null)
  targetLocation: string | null;
  reason: string | null;
  workDescription: string | null;
  authorityEvidence: string | null;
  justification: string | null;
  // 진술·동의
  statements: { goodFaith: boolean; accuracy: boolean | null; acceptedAt: string };
  consentAcceptedAt: string;
  // 연결
  relatedReceiptNo: string | null;
  relatedReport: RelatedReportSummary | null;
  counterNotices: RelatedReportSummary[];
  // 처리
  resolutionCode: ReportResolutionCode | null;
  resolutionNote: string | null;
  internalMemo: string | null;
  // 통지
  notifyAttempts: number;
  notifyLastError: string | null;
  notifiedAt: string | null;
  // 보존
  legalHoldNote: string | null;
  // 서버가 전이표로 계산 — 웹이 전이표를 중복 구현하지 않는다
  allowedTransitions: ReportStatus[];
  /** 오래된 순 */
  events: ReportEventView[];
}

export interface AdminReportStatusChangeRequest {
  toStatus: Exclude<ReportStatus, 'received'>;
  fromStatus?: ReportStatus;
  resolutionCode?: ReportResolutionCode;
  resolutionNote?: string;
  note?: string;
}

export interface AdminReportMemoRequest {
  internalMemo: string | null;
}

// ── 어드민 액션 (#8~#10) ──

export interface AdminReportNotifyState {
  notifyStatus: ReportNotifyStatus;
  notifyAttempts: number;
  notifiedAt: string | null;
  notifyLastError: string | null;
}

export interface AdminReportAnonymizeRequest {
  confirmReceiptNo: string;
  note?: string;
}

export interface AdminReportAnonymizeResult {
  id: string;
  status: ReportStatus;
  resolutionCode: ReportResolutionCode | null;
  anonymizedAt: string;
}

export interface AdminReportLegalHoldRequest {
  legalHold: boolean;
  legalHoldNote?: string | null;
}

export interface AdminReportLegalHoldState {
  legalHold: boolean;
  legalHoldNote: string | null;
  updatedAt: string;
}
