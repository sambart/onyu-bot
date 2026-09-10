/**
 * 관리 로그 채널 공유 계약 (F-ADMIN-LOG-001~011).
 * 정본: docs/plans/guild-admin-log-channel.md §3 "PII 불변식을 타입으로 봉인하는 방법".
 *
 * `libs/shared` 는 `apps/api` 를 참조할 수 없으므로, 도메인 엔티티(멤버 표시명을 가진 객체)가
 * payload 타입으로 흘러들 경로가 구조적으로 없다 — 이 파일 자체가 PII 불변식(F-ADMIN-LOG-010,
 * 집계·ID 만 · 표시명/유저명 미포함)의 컴파일 단계 봉인 지점이다.
 */

/** 관리 로그 kind — 닫힌 유니온. 신규 훅은 여기에 리터럴을 추가해야만 publish() 가 컴파일된다. */
export type AdminLogKind =
  | 'inactive_auto_role' // 훅① 비활동 자동 역할
  | 'newbie_role_expired' // 훅② 신입 역할 만료
  | 'level_role_grant_failed' // 훅③ 레벨 역할 부여 실패 — 유일하게 1시간 집계 윈도우 적용
  | 'newbie_onboarding_failed' // 훅④ 신입 온보딩(환영 메시지/역할 부여) 실패
  | 'weekly_report_failed' // 훅⑤ 주간 리포트 발송 실패
  | 'weekly_report_auto_disabled' // 훅⑤ 주간 리포트 연속 실패로 자동 비활성화
  | 'llm_quota_warning'; // 훅⑦ LLM 쿼터 80% 도달

/**
 * LLM 쿼터 scope — `apps/api` 의 `LlmQuotaScope`(`common/llm/llm-quota.service.ts`) 와 값이
 * 동일해야 한다. `libs/shared` 가 api 를 참조할 수 없어 자체 선언하며, 동기 검증은 훅⑦ 구현부에서
 * `LlmQuotaScope` → `AdminLogQuotaScope` 대입이 컴파일되는지로 자연히 이뤄진다.
 */
export type AdminLogQuotaScope =
  | 'ai-insight'
  | 'health-diagnosis'
  | 'best-friend'
  | 'weekly-report'
  | 'me-ment'
  | 'admin-assist';

/**
 * kind → payload 매핑. F-ADMIN-LOG-010 PII 불변식의 컴파일 단계 봉인 지점이다.
 * ⚠️ 이 맵 어디에도 표시명(displayName)·유저명(username)·닉네임 필드를 추가하지 말 것.
 *    추가하려면 PRD F-ADMIN-LOG-010 개정이 선행되어야 한다.
 */
export interface AdminLogPayloadMap {
  inactive_auto_role: { successCount: number; failCount: number; logId: number };
  newbie_role_expired: { successCount: number; failCount: number };
  level_role_grant_failed: { failCount: number };
  newbie_onboarding_failed: { memberId: string; kind: 'welcome_message' | 'role_assignment' };
  weekly_report_failed: { sendStatus: 'failed' | 'collect_failed' | 'skipped_no_channel' };
  weekly_report_auto_disabled: Record<string, never>;
  llm_quota_warning: {
    scope: AdminLogQuotaScope;
    count: number;
    limit: number;
    resetAt: string;
  };
}

/**
 * 관리 로그 채널 설정 — `GET/PUT /api/guilds/:guildId/admin-log/config` 요청/응답 공유 셰이프
 * (F-ADMIN-LOG-001·009). `channelId` 는 자동 비활성화 후에도 값이 보존된다(재설정 폼 기본값 노출용).
 */
export interface AdminLogConfigDto {
  enabled: boolean;
  channelId: string | null;
}

/**
 * Bot → API 신입 온보딩 실패 수집 payload (`POST /bot-api/newbie/onboarding-failure`, F-ADMIN-LOG-006).
 * 🔒 `memberId` 는 관리 로그 Embed 딥링크 URL 파라미터 전용이며 Embed 텍스트에 직접 노출하지 않는다.
 */
export interface NewbieOnboardingFailureDto {
  guildId: string;
  memberId: string;
  kind: 'welcome_message' | 'role_assignment';
}
