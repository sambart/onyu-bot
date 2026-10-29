/** 2026 결산 연도(F-RECAP-009 — 2026 고정). 2027 은 재기획 시 변경 */
export const RECAP_YEAR = 2026;
/** 노출 창(KST 달력 일자, 양끝 포함) — 시작은 결산 연도, 종료는 익년 */
// 변경 시 bot i18n `meRecapNotStarted`(ko/en) 날짜 문구도 같이 고칠 것 — 문구에 날짜가 하드코딩돼 있다.
export const RECAP_WINDOW_START_MMDD = '1215';
export const RECAP_WINDOW_END_MMDD = '0115';

/** 서버 결산 자동 게시 기본값(R-S4 opt-out) — weekly_report_config.yearEndRecapAutoPost 컬럼 default */
export const YEAR_END_RECAP_AUTO_POST_DEFAULT = true;
/** 길드·연도당 수동 게시 성공 한도(F-RECAP-026) */
export const YEAR_END_RECAP_MANUAL_POST_LIMIT = 3;
/** 자동 게시 최대 시도 회차(F-RECAP-025) */
export const YEAR_END_RECAP_AUTO_POST_MAX_ATTEMPTS = 3;
/** 자동 게시 기간 종료(KST 달력 일자, 포함) — 시작은 RECAP_WINDOW_START_MMDD */
export const RECAP_AUTO_POST_END_MMDD = '1231';
