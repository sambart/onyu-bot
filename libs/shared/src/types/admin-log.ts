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
  | 'llm_quota_warning' // 훅⑦ LLM 쿼터 80% 도달
  | 'moco_rank_auto_disabled' // 새싹 사냥 순위 채널 접근 불가로 자동 갱신 비활성화
  | 'newbie_mission_reward_failed' // 훅 신입 미션 완료 보상 역할 부여 실패 (집계 윈도우 미적용)
  | 'inactive_role_hierarchy_violation'; // 비활동 저장 역할 위계 위반(F-INACTIVE-016 ③) — 알림 전용, KST 일 1회

/**
 * 역할 조치 실패 사유 — `apps/api` 의 `RoleFailureReason`(`inactive-member-role-failure.ts`) 와 값이
 * 동일해야 한다. 동기 검증은 호출부의 캐스트 없는 대입으로 컴파일러가 수행한다(`AdminLogQuotaScope` 선례).
 */
export type AdminLogRoleFailureReason =
  | 'MISSING_PERMISSIONS'
  | 'UNKNOWN_MEMBER'
  | 'UNKNOWN_ROLE'
  | 'UNKNOWN';

/** 사유별 실패 건수 (F-INACTIVE-016 ②) */
export type AdminLogRoleFailureCounts = Partial<Record<AdminLogRoleFailureReason, number>>;

/** 위계 위반 역할의 "종류" — 역할 ID·이름은 담지 않는다. */
export type InactiveRoleHierarchyTarget = 'inactive_role' | 'remove_role';

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
 * 신입 온보딩 실패 유형. `config_lookup` 은 입장 시 newbie 설정 조회가 일시 실패해
 * 환영·미션·역할 부여가 통째로 누락된 경우(감사 A5/D3 a, 2026-10-28 추가 — 구 API 는 400 으로 거절하되
 * 봇이 fire-and-forget 이라 무해하므로 API 선배포가 안전하다).
 */
export type NewbieOnboardingFailureKind = 'welcome_message' | 'role_assignment' | 'config_lookup';

/**
 * kind → payload 매핑. F-ADMIN-LOG-010 PII 불변식의 컴파일 단계 봉인 지점이다.
 * ⚠️ 이 맵 어디에도 표시명(displayName)·유저명(username)·닉네임 필드를 추가하지 말 것.
 *    추가하려면 PRD F-ADMIN-LOG-010 개정이 선행되어야 한다.
 */
export interface AdminLogPayloadMap {
  inactive_auto_role: {
    successCount: number;
    failCount: number;
    logId: number;
    /** 실패가 있을 때만 존재(additive) */
    failReasons?: AdminLogRoleFailureCounts;
  };
  newbie_role_expired: { successCount: number; failCount: number };
  level_role_grant_failed: { failCount: number };
  newbie_onboarding_failed: { memberId: string; kind: NewbieOnboardingFailureKind };
  weekly_report_failed: { sendStatus: 'failed' | 'collect_failed' | 'skipped_no_channel' };
  weekly_report_auto_disabled: Record<string, never>;
  llm_quota_warning: {
    scope: AdminLogQuotaScope;
    count: number;
    limit: number;
    resetAt: string;
  };
  moco_rank_auto_disabled: { channelId: string; reason: 'unknown_channel' | 'missing_access' };
  newbie_mission_reward_failed: { failCount: number };
  /** 역할 ID·이름을 넣지 않는다 — `<@&id>` 렌더 시 이름이 노출된다(F-INACTIVE-016 ③) */
  inactive_role_hierarchy_violation: { violations: InactiveRoleHierarchyTarget[] };
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
  kind: NewbieOnboardingFailureKind;
}
