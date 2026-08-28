/** k-익명성 하한 — 표본 길드 수가 이 값 미만이면 벤치마크를 노출하지 않는다(✅ 2026-08-28 사용자 확정).
 *  🔒 env 가 아니라 코드 상수다 — 프라이버시 임계값을 운영 설정으로 손쉽게 낮추는 것을 의도적으로 막는다(PRD §10). */
export const BENCHMARK_MIN_SAMPLE_GUILDS = 10;
/** 관측 윈도우(일) — 웹 days 프리셋과 무관한 고정값. F-VOICE-040 건강도 산식과 동일 윈도우 */
export const BENCHMARK_WINDOW_DAYS = 7;
/** 유효 표본 판정용 조회 창(일) */
export const BENCHMARK_SAMPLE_LOOKBACK_DAYS = 30;
/** 유효 표본 조건 — 최근 30일 활동일수 하한 */
export const BENCHMARK_MIN_ACTIVE_DAYS = 7;
/** 유효 표본 조건 — 최근 30일 활동 고유 유저 수 하한 */
export const BENCHMARK_MIN_UNIQUE_USERS = 5;
/** 참여 지속 판정 — 7일 중 활동일수 하한 */
export const BENCHMARK_RETENTION_MIN_ACTIVE_DAYS = 2;
