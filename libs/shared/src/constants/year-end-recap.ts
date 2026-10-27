/** 2026 결산 연도(F-RECAP-009 — 2026 고정). 2027 은 재기획 시 변경 */
export const RECAP_YEAR = 2026;
/** 노출 창(KST 달력 일자, 양끝 포함) — 시작은 결산 연도, 종료는 익년 */
// 변경 시 bot i18n `meRecapNotStarted`(ko/en) 날짜 문구도 같이 고칠 것 — 문구에 날짜가 하드코딩돼 있다.
export const RECAP_WINDOW_START_MMDD = '1215';
export const RECAP_WINDOW_END_MMDD = '0115';
