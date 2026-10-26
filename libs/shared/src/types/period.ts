/**
 * 조회 "기간"의 정본 — 일수 프리셋 + 임의 날짜 범위(time-range-query-expansion P1).
 * 날짜는 전부 YYYYMMDD 문자열이며 타임존과 무관한 달력 산술만 수행한다
 * (임의 범위의 from/to 는 이미 조회 타임존 기준 로컬 일자이므로 환산하지 않는다).
 */

/** 일수 프리셋. 값 = 오늘로부터 차감할 일수(실제 조회 캘린더일은 days + 1). */
export type DayPreset = 7 | 14 | 30 | 60 | 90;

/** 음성 대시보드 프리셋 목록(오름차순). */
export const VOICE_PERIOD_DAYS = [7, 14, 30, 60, 90] as const satisfies readonly DayPreset[];

export const DEFAULT_VOICE_PERIOD_DAYS: DayPreset = 7;

/** 임의 날짜 범위. YYYYMMDD, 양끝 포함. */
export interface CustomDateRange {
  from: string;
  to: string;
}

/**
 * 기간 선택값 판별 유니온. 새 kind 는 추가만 하고, 소비 지점은
 * `switch (selection.kind)` + `never` 소진으로 작성해 tsc 가 누락을 드러내게 한다.
 */
export type PeriodSelection =
  | { kind: 'preset'; days: DayPreset }
  | { kind: 'custom'; range: CustomDateRange };

const YMD_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONTH_INDEX_OFFSET = 1;
const YMD_PAD = 2;

function parseYmdToUtcMs(ymd: string): number | null {
  const match = YMD_PATTERN.exec(ymd);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - MONTH_INDEX_OFFSET, day);
  const date = new Date(ms);
  // 2월 30일 같은 넘침 입력을 걸러낸다(Date.UTC 는 조용히 이월한다).
  const isRoundTrip =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - MONTH_INDEX_OFFSET &&
    date.getUTCDate() === day;
  return isRoundTrip ? ms : null;
}

function formatUtcMsToYmd(ms: number): string {
  const date = new Date(ms);
  const year = String(date.getUTCFullYear()).padStart(YMD_PAD + YMD_PAD, '0');
  const month = String(date.getUTCMonth() + MONTH_INDEX_OFFSET).padStart(YMD_PAD, '0');
  const day = String(date.getUTCDate()).padStart(YMD_PAD, '0');
  return `${year}${month}${day}`;
}

/** 양끝 포함 일수. 형식 오류 또는 역순이면 0. */
export function countInclusiveDays(range: CustomDateRange): number {
  const fromMs = parseYmdToUtcMs(range.from);
  const toMs = parseYmdToUtcMs(range.to);
  if (fromMs === null || toMs === null || fromMs > toMs) return 0;
  return Math.round((toMs - fromMs) / MS_PER_DAY) + 1;
}

/**
 * `from <= to` 이고 양끝 포함 일수가 `maxInclusiveDays` 이하인가.
 * API `IsValidDateRange` 와 같은 양끝 포함 셈법이다.
 */
export function isWithinMaxSpan(range: CustomDateRange, maxInclusiveDays: number): boolean {
  const days = countInclusiveDays(range);
  return days > 0 && days <= maxInclusiveDays;
}

/** 범위의 모든 날짜(YYYYMMDD)를 오름차순으로 나열한다. 유효하지 않으면 빈 배열. */
export function listYmdInRange(range: CustomDateRange): string[] {
  const fromMs = parseYmdToUtcMs(range.from);
  const days = countInclusiveDays(range);
  if (fromMs === null || days === 0) return [];
  return Array.from({ length: days }, (_, i) => formatUtcMsToYmd(fromMs + i * MS_PER_DAY));
}

/** '20261021' → '2026-10-21' (`<input type="date">` 값). 형식 불일치 시 빈 문자열. */
export function ymdToIsoDate(ymd: string): string {
  const match = YMD_PATTERN.exec(ymd);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

/** '2026-10-21' → '20261021'. 형식 불일치 시 null. */
export function isoDateToYmd(iso: string): string | null {
  const match = ISO_DATE_PATTERN.exec(iso);
  return match ? `${match[1]}${match[2]}${match[3]}` : null;
}

/** 선택값의 원시 문자열 키(`p7` / `c20260901-20260930`) — 리셋 키·테스트용. */
export function getPeriodSelectionKey(selection: PeriodSelection): string {
  switch (selection.kind) {
    case 'preset':
      return `p${selection.days}`;
    case 'custom':
      return `c${selection.range.from}-${selection.range.to}`;
    default: {
      const exhaustive: never = selection;
      return exhaustive;
    }
  }
}
