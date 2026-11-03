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
const FILENAME_EXTENSION = '.csv';
/** 파일명에 허용하지 않는 문자(ASCII 영숫자·`_`·`-` 외) — 헤더 주입·경로 문자 차단용. */
const FILENAME_UNSAFE_PATTERN = /[^0-9A-Za-z_-]/g;

/**
 * `onyu-activity-{guildId}-{from}-{to}.csv`. ASCII 만 사용하며 길드 이름은 포함하지 않는다.
 * `from`/`to` 는 YYYYMMDD. 허용 외 문자는 제거한다.
 */
export function buildActivityExportFilename(guildId: string, from: string, to: string): string {
  const safe = (value: string): string => value.replace(FILENAME_UNSAFE_PATTERN, '');
  return `${FILENAME_PREFIX}-${safe(guildId)}-${safe(from)}-${safe(to)}${FILENAME_EXTENSION}`;
}
