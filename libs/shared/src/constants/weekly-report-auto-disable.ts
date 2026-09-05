/**
 * 주간 리포트 연속 발송 실패 자동 비활성화 임계치(F-GEMINI-034).
 * 🔒 env 가 아니라 코드 상수다 — 운영 env 로 손쉽게 조정하는 것을 의도적으로 방지한다
 * (`benchmark.ts` 의 `BENCHMARK_MIN_SAMPLE_GUILDS` 선례 계승).
 */
export const WEEKLY_REPORT_AUTO_DISABLE_THRESHOLD = 4;
