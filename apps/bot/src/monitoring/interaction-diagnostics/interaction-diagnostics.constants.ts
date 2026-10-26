/** 데드라인 직전 판정 시점 (ms) — Discord 최초 응답 데드라인 3초에서 응답 API 왕복 여유를 뺀 값 */
export const INTERACTION_CHECK_AT_MS = 2800;

/** 수신 로그에 남기는 customId 최대 길이 */
export const CUSTOM_ID_LOG_MAX_LENGTH = 64;

/** customId prefix 구분자 */
export const CUSTOM_ID_SEPARATOR = ':';

/** ws ping 점검 @Interval 이름 — 레포 관례대로 명명해 SchedulerRegistry 에서 식별 가능하게 한다 */
export const PING_CHECK_INTERVAL_NAME = 'gateway-ping-check';

/** ws ping 주기 점검 간격 (ms) */
export const PING_CHECK_INTERVAL_MS = 60_000;

/** 이 값(ms)을 초과하면 ping 지연 경고 */
export const PING_WARN_THRESHOLD_MS = 1000;
