// 길드 설정 변경 이력 열람 API 공유 계약 (F-SETTINGS-AUDIT-006 2차 범위).
// 정본: docs/plans/settings-audit-history.md §2 P0 · docs/specs/endpoint-spec/guild-settings-audit-log.md §4

/**
 * `actorDiscordUserId` 에 들어갈 수 있는 sentinel 2종.
 * ⚠️ 값은 apps/api `common/audit/guild-settings-audit.constants.ts` 와 **반드시 동일**해야 한다
 *    (api 쪽 상수는 "값 변경 금지" — 바꾸면 익명화된 과거 행과 불일치).
 *    동일성은 apps/api/src/common/audit/guild-settings-audit.constants.spec.ts 가 고정한다.
 * 클라이언트는 숫자(snowflake) 파싱보다 **먼저** 이 값들을 분기한다.
 */
export const SETTINGS_AUDIT_ACTOR_SENTINEL = {
  ANONYMIZED: 'anonymized_user', // GDPR 삭제 요청 처리 결과 (F-SETTINGS-AUDIT-008)
  UNKNOWN: 'unknown', // 인터셉터 방어값(정상 흐름 미발생)
} as const;

/** guild_settings_audit_log 1행. guildId 는 경로 파라미터와 항상 같아 응답에 싣지 않는다. */
export interface SettingsAuditLogItem {
  id: string;
  actorDiscordUserId: string;
  /** guild_member 스냅샷의 displayName. 미스냅샷·탈퇴·sentinel 이면 null → 클라이언트가 폴백 표시. */
  actorDisplayName: string | null;
  httpMethod: string;
  requestPath: string;
  statusCode: number;
  payloadJson: Record<string, unknown> | null;
  /** true = 64KB 초과 또는 직렬화 실패로 payloadJson 이 null 로 대체됨("일부 생략됨"). */
  payloadTruncated: boolean;
  createdAt: string; // ISO8601 UTC
}

/** keyset 페이지네이션 응답. nextCursor 는 불투명 문자열 — 클라이언트가 파싱·조립하지 않는다. */
export interface SettingsAuditLogListResponse {
  items: SettingsAuditLogItem[];
  nextCursor: string | null;
}

/** 열람 API 쿼리 파라미터 (웹 클라이언트 apps/web/app/lib/settings-audit-api.ts 용). */
export interface SettingsAuditLogListQuery {
  /** 1..50, 기본 50. 초과 시 서버가 400. */
  limit?: number;
  /** 직전 응답의 nextCursor 를 그대로 되돌려 보낸다. */
  cursor?: string;
  /** requestPath 전방 일치 필터(절대 경로). 예: /api/guilds/123/newbie */
  pathPrefix?: string;
  /** true 면 2xx 행만(= "마지막 변경"). 기본 false. */
  successOnly?: boolean;
}
