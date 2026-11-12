/**
 * KST(Asia/Seoul, UTC+9, DST 없음) 날짜 산술의 정본(kst-canonical — 패턴 위생 감사 F7).
 * 런타임 프로세스 TZ 에 의존하지 않도록 `+9h` 이동 후 UTC 필드만 읽거나(`toISOString`),
 * `Date.UTC` + `getUTC*` 달력 산술만 쓴다. 외부 의존이 없어 api · bot · web 이 같은 산식을 공유한다.
 * api `common/util/kst.util.ts` 는 이 모듈 위의 `date-fns-tz` 기반 얇은 층이다.
 */

/** KST 오프셋(ms) — UTC+09:00, DST 없음 */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DASH_DATE_LENGTH = 10;
const YMD_YEAR_END = 4;
const YMD_MONTH_END = 6;
const YMD_DAY_END = 8;

/** 시각의 KST 달력 일자 'YYYY-MM-DD' */
function toKstIsoDate(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, DASH_DATE_LENGTH);
}

/**
 * 주어진 날짜를 YYYYMMDD 형식 문자열로 반환한다 (KST 기준).
 * 인자를 생략하면 현재 시각(now) 기준으로 반환한다 (기존 호출부 하위호환).
 */
export function getKSTDateString(date: Date = new Date()): string {
  return toKstIsoDate(date).replace(/-/g, '');
}

/** 주어진 시각의 KST 달력 일자를 'YYYY-MM-DD' 로 반환한다 (DB `date` 컬럼 · `TO_CHAR` 비교용). */
export function getKSTDashDateString(date: Date = new Date()): string {
  return toKstIsoDate(date);
}

/**
 * YYYYMMDD 에 일수를 더한다(음수 = 뺄셈). `Date.UTC` 이월 규칙을 그대로 따르므로
 * 범위 밖 일자(예: 20260230)도 `new Date(y, m, d)` 와 같은 날로 정규화된다.
 */
export function addDaysToYyyymmdd(yyyymmdd: string, days: number): string {
  const year = parseInt(yyyymmdd.slice(0, YMD_YEAR_END), 10);
  const month = parseInt(yyyymmdd.slice(YMD_YEAR_END, YMD_MONTH_END), 10) - 1;
  const day = parseInt(yyyymmdd.slice(YMD_MONTH_END, YMD_DAY_END), 10);
  const shifted = new Date(Date.UTC(year, month, day) + days * MS_PER_DAY);
  return shifted.toISOString().slice(0, DASH_DATE_LENGTH).replace(/-/g, '');
}

/** 'YYYY-MM-DD' 에 일수를 더한다(음수 = 뺄셈). */
export function addDaysToDashDate(dashDate: string, days: number): string {
  const [year, month, day] = dashDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY);
  return shifted.toISOString().slice(0, DASH_DATE_LENGTH);
}
