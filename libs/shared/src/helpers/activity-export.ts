/**
 * 길드 활동 집계 CSV(F-SUB-032, U8-B1) 공유 규약 — 컬럼 키 · BOM · 파일명 규칙의 단일 출처.
 * api(응답 헤더·본문)와 web(저장 파일명·BOM 보정)이 같은 규칙을 쓰도록 여기에 둔다.
 */

/** CSV 헤더 컬럼(영문 고정 — 스프레드시트·스크립트 재사용성). 사용자 식별자·채널명 컬럼은 두지 않는다(U8B-6). */
export const ACTIVITY_EXPORT_CSV_COLUMNS = [
  'date_kst',
  'voice_duration_sec',
  'message_count',
] as const;

/** UTF-8 BOM(U+FEFF) — 엑셀이 UTF-8 로 인식하도록 파일 선두에 붙인다. */
export const UTF8_BOM = '\uFEFF';

const FILENAME_PREFIX = 'onyu-activity';
/** 개인 활동 CSV(F-SUB-041, U8-B5) — 길드 집계 파일과 구분되도록 prefix 를 따로 둔다. */
const MY_FILENAME_PREFIX = 'onyu-my-activity';
const FILENAME_EXTENSION = '.csv';
/** 파일명에 허용하지 않는 문자(ASCII 영숫자·`_`·`-` 외) — 헤더 주입·경로 문자 차단용. */
const FILENAME_UNSAFE_PATTERN = /[^0-9A-Za-z_-]/g;

function sanitizeFilenamePart(value: string): string {
  return value.replace(FILENAME_UNSAFE_PATTERN, '');
}

/**
 * `onyu-activity-{guildId}-{from}-{to}.csv`. ASCII 만 사용하며 길드 이름은 포함하지 않는다.
 * `from`/`to` 는 YYYYMMDD. 허용 외 문자는 제거한다.
 */
export function buildActivityExportFilename(guildId: string, from: string, to: string): string {
  return `${FILENAME_PREFIX}-${sanitizeFilenamePart(guildId)}-${sanitizeFilenamePart(from)}-${sanitizeFilenamePart(to)}${FILENAME_EXTENSION}`;
}

/**
 * 개인 활동 CSV 파일명 `onyu-my-activity-{guildId}-{from}-{to}.csv`(F-SUB-041).
 * 사용자 ID·표시명은 넣지 않는다 — 파일이 공유돼도 누구의 기록인지 파일명으로 드러나지 않게.
 */
export function buildMyActivityExportFilename(guildId: string, from: string, to: string): string {
  return `${MY_FILENAME_PREFIX}-${sanitizeFilenamePart(guildId)}-${sanitizeFilenamePart(from)}-${sanitizeFilenamePart(to)}${FILENAME_EXTENSION}`;
}

/** 활동 집계 조회·내보내기 기간 상한(캘린더일, 시작·종료일 양끝 포함) — api DTO 검증과 web 사전 차단의 단일 출처.
 * 일수 계산은 `types/period.ts` 의 `countInclusiveDays`/`isWithinMaxSpan`/`listYmdInRange` 가 정본이다. */
export const MAX_ACTIVITY_EXPORT_RANGE_DAYS = 92;
