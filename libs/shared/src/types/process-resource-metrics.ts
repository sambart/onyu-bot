/**
 * 단일 Node.js 프로세스의 리소스 사용량(F-SUPER-ADMIN-035/036). 봇·API 프로세스 공통 shape.
 *
 * `super-admin.ts` 에서 분리한 이유: 봇(`apps/bot` Prometheus 서비스)이 이 타입만 쓰는데,
 * `super-admin.ts` 는 public 미러(`scripts/mirror-bot.sh`)에서 내부 전용으로 제거되는 파일이라
 * 같은 파일에 두면 미러 빌드가 깨진다. 어드민 콘솔 전용 타입은 계속 `super-admin.ts` 에 둔다.
 */
export interface ProcessResourceMetrics {
  /** 상주 메모리(RSS) — bytes, 정수 */
  rssBytes: number;
  /** V8 heap 사용량 — bytes, 정수 */
  heapUsedBytes: number;
  /** 직전 샘플 대비 CPU 사용률(%) — 단일 코어 100% 기준(멀티코어 정규화 없음), 소수 1자리 */
  cpuPercent: number;
}
