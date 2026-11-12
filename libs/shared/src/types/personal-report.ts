/**
 * 개인 AI 월간 리포트 공유 계약 — U8-B4 (F-SUB-043). `GET/POST /api/users/me/reports/monthly`.
 * 구현 계약 정본: docs/plans/u8b4-ai-deepening.md §4-1.
 */
import { isOneOf } from '../helpers/is-one-of';

export const PERSONAL_REPORT_KINDS = ['auto', 'ondemand'] as const;
export type PersonalReportKind = (typeof PERSONAL_REPORT_KINDS)[number];

export const PERSONAL_REPORT_STATUSES = ['pending', 'completed', 'insufficient', 'failed'] as const;
export type PersonalReportStatus = (typeof PERSONAL_REPORT_STATUSES)[number];

/** 저장값·요청값 검증용 타입 가드. */
export function isPersonalReportKind(value: unknown): value is PersonalReportKind {
  return typeof value === 'string' && isOneOf(PERSONAL_REPORT_KINDS, value);
}

/** 저장값·요청값 검증용 타입 가드. */
export function isPersonalReportStatus(value: unknown): value is PersonalReportStatus {
  return typeof value === 'string' && isOneOf(PERSONAL_REPORT_STATUSES, value);
}

/** 온디맨드 월 한도(Plus) — 표시용 단일 출처(N10). 서버 실제 값은 env, 런타임 표시는 API `onDemand.limit`. */
export const PERSONAL_REPORT_ONDEMAND_MONTHLY_LIMIT_PLUS = 2;

export interface PersonalReportListItem {
  /** YYYYMM (KST 대상월) */
  yearMonth: string;
  kind: PersonalReportKind;
  status: PersonalReportStatus;
  /** claimedAt 설정 && 15분 미경과 (X9) */
  isGenerating: boolean;
  /** auto·failed·attempts<3·생성월 말일 이전·현재 자격 유효 (X5·M26 ④) — 그 외 false */
  willRetry: boolean;
  /** ISO 8601 */
  generatedAt: string | null;
}

export type PersonalReportLastOutcome = 'failed' | 'insufficient';

export interface PersonalReportOnDemandQuota {
  used: number;
  limit: number;
  resetAt: string;
  isAvailable: boolean;
  /** 이번 달 재생성의 직전 비완료 결과(M32, 1h) — 없으면 null */
  lastOutcome: PersonalReportLastOutcome | null;
}

/** monthlyReportEnabled 없음 (X3) */
export interface PersonalReportListResponse {
  items: PersonalReportListItem[];
  onDemand: PersonalReportOnDemandQuota;
}

export interface PersonalReportTimeOfDay {
  dawnSec: number;
  morningSec: number;
  afternoonSec: number;
  eveningSec: number;
}

export interface PersonalReportPreviousDelta {
  totalVoiceSecChangePct: number | null;
  activeDaysChange: number | null;
  /** auto = 총량 비교, ondemand(부분월) = 일평균 비교 (M31) */
  basis: 'total' | 'dailyAverage';
  /** 전월 auto metrics 에 시간대가 있을 때만 true */
  timeOfDayComparable: boolean;
  notable: Array<'voiceUp' | 'voiceDown' | 'activeDaysUp' | 'activeDaysDown'>;
}

/** userId·표시명·길드명·채널명·원시 타임스탬프 필드 금지 (N29). */
export interface PersonalReportMetrics {
  schemaVersion: 1;
  /** D (D-8) */
  periodDays: number;
  totalVoiceSec: number;
  activeDays: number;
  avgVoiceSecPerActiveDay: number;
  longestStreakDays: number;
  micOnRatio: number | null;
  aloneSec: number;
  streamingSec: number;
  videoOnSec: number;
  serverCount: number;
  topServerSharePct: number | null;
  /** 길이 7, 월요일=0 */
  weekdayDistributionSec: number[];
  /** 90일 창 밖이면 null */
  timeOfDay: PersonalReportTimeOfDay | null;
  previousMonthDelta: PersonalReportPreviousDelta | null;
}

export interface PersonalReportDetailResponse extends PersonalReportListItem {
  body: string | null;
  metrics: PersonalReportMetrics | null;
}

export type GeneratePersonalReportOutcome = 'completed' | 'insufficient' | 'pending';

export interface GeneratePersonalReportResponse {
  outcome: GeneratePersonalReportOutcome;
  report: PersonalReportDetailResponse | null;
  onDemand: PersonalReportOnDemandQuota;
}
