// admin-assist 도메인 공유 타입 — Phase 1(추천 내비게이터) + Phase 2a(분석 레시피) 웹↔API 계약
// docs/specs/endpoint-spec/admin-assist.md §2-2·§4-2·§5-2·§2A 정본

import type { QuotaItemBase } from './quota';

/**
 * 이력 `resultStatus` 6값 중 200으로 내려오는 5값. `quota_exhausted`만 429로 분기한다.
 * Phase 2a — `partial_success`(라우팅+사전계산 성공, 2콜 해석만 실패) 추가(F-ADMIN-ASSIST-028).
 */
export type AdminAssistResultStatus =
  | 'success'
  | 'no_match'
  | 'rejected'
  | 'llm_error'
  | 'partial_success';

/** 질의 트리거 3값(H4) — 자유 입력 / 상시 칩 / 후속 칩 */
export type AdminAssistSource = 'chip' | 'followup_chip' | 'free';

/** Phase 2a — 매칭된 카탈로그 항목의 종류(F-ADMIN-ASSIST-019 판별자). 매칭 실패 시 응답에서 null */
export type AdminAssistKind = 'setting' | 'recipe';

export interface AdminAssistParameter {
  key: string;
  /** locale 반영 표시 라벨 */
  label: string;
  /** isValidated=false 면 항상 null → 웹은 "권장값 없음"으로 렌더(F-005) */
  value: string | number | boolean | null;
  /** 서버측 재검증(F-005) 통과 여부 */
  isValidated: boolean;
}

export interface AdminAssistRecommendation {
  /** 카탈로그 닫힌 enum 값(예: 'newbie.welcome'). 이력 recipeId와 동일 값 */
  actionId: string;
  /** 카탈로그 description 파생 제목(locale 반영) */
  title: string;
  /** 카탈로그·i18n 파생 설명 문구(결정 ⓐ) — LLM이 자유 텍스트로 생성하지 않는다 */
  description: string;
  /** :guildId 치환이 끝난 완성 경로(예: '/settings/guild/123/newbie') */
  settingsDeepLink: string;
  parameters: AdminAssistParameter[];
}

export interface AdminAssistFallback {
  /** 카탈로그 exampleQueries 파생 "지원 기능 목록" 안내(F-018) */
  supportedExamples: string[];
  /**
   * F-041(L3) — 질의(sanitize 완료분) + 카탈로그 요약을 입력으로 한 LLM 생성 자연어 답변.
   * **표시 전용** — actionId 재매칭·파라미터 추출·액션 트리거 없음(mutation 0 계승).
   * 생성 콜 실패(강등) 시 `null` → 웹은 정적 목록만 렌더한다.
   * 웹은 XSS-safe 렌더(dangerouslySetInnerHTML 금지 — interpretation과 동일 관행).
   */
  generatedGuidance: string | null;
}

/** GET /api/guilds/:guildId/admin-assist/quota 응답 (F-ADMIN-ASSIST-007) */
export interface AdminAssistQuotaResponse extends QuotaItemBase {
  scope: 'admin-assist';
}

// ── Phase 2a — 분석 결과 (endpoint-spec §2A-2~§2A-4) ────────────────────────

/**
 * 결정론 안내 코드 — 문구가 아니라 코드를 내린다. 웹이 `libs/i18n`에서 문구를 렌더한다.
 * - `interpretation_unavailable`: 2콜 해석 실패 → partial_success(§2A-5)
 * - `no_comparable_data`: Q5 — 두 구간 모두 0(F-022 폴백)
 * - `channel_not_found_scanned_all`: Q3 — channelId 재검증 실패 → 전체 스캔 폴백(F-029)
 * - `channel_names_unavailable`: Q3·Q8 — 채널 이름 resolve 실패(§2A-7). 분석 자체는 유효
 * - `insufficient_cohort_sample`: Q1 — k-익명성 미달(joinCount<5, 본 계획 §3 ⑦ 신설)
 * - `role_snapshot_stale`: Q8 — 역할 스냅샷이 48시간을 넘겨 룰 ②를 보류함(본 계획 §0-3 신설)
 */
export type AdminAssistAnalysisNoticeCode =
  | 'interpretation_unavailable'
  | 'no_comparable_data'
  | 'channel_not_found_scanned_all'
  | 'channel_names_unavailable'
  | 'insufficient_cohort_sample'
  | 'role_snapshot_stale';

interface AdminAssistAnalysisBase {
  /** 카탈로그 title 파생(locale 반영) — LLM 미생성 */
  title: string;
  /**
   * 서버 재검증 결과를 포함한 파라미터 투영(F-005 타입 그대로 재사용, F-029).
   * 파라미터가 없는 레시피(Q5·Q8·Q1)는 빈 배열이다 — 필드를 생략하지 않는다.
   */
  parameters: AdminAssistParameter[];
  /**
   * 2콜 LLM 해석 텍스트. 사전계산 수치와 물리적으로 분리된 유일한 LLM 생성 필드.
   * partial_success면 null(§2A-5). 웹은 XSS-safe 마크다운 렌더(dangerouslySetInnerHTML 금지).
   */
  interpretation: string | null;
  /** 결정론 안내 코드 목록(동시 발생 가능 — 배열) — LLM 미생성 */
  notices: AdminAssistAnalysisNoticeCode[];
}

/** Q5 — F-022. 고정 창 비교(최근 30일 vs 직전 30일, 오늘 제외), 파라미터 없음 */
export interface ActivityTrendMetrics {
  /** 30 고정(상수화) */
  windowDays: number;
  current: { voiceSeconds: number; micOnSeconds: number; messageCount: number };
  previous: { voiceSeconds: number; micOnSeconds: number; messageCount: number };
  delta: { voiceSeconds: number; micOnSeconds: number; messageCount: number };
  /** 직전 구간이 0이면 증감률이 정의되지 않는다 → null(∞·NaN을 내리지 않는다) */
  deltaPercent: {
    voiceSeconds: number | null;
    micOnSeconds: number | null;
    messageCount: number | null;
  };
  /** 두 구간 모두 0 → 결정론 안내로 낙하(notices에 no_comparable_data, resultStatus는 success 유지) */
  isBothWindowsEmpty: boolean;
}

/** Q3 — F-023. 추천 전용(실행 버튼 없음, B4) */
export interface DecliningChannelsMetrics {
  windowDays: number;
  /** 'single' = channelId 재검증 통과, 'all' = 미지정 또는 재검증 실패 폴백(F-029) */
  scope: 'all' | 'single';
  /** LLM이 추출한 원본 채널 ID(재검증 실패 시에도 회고용으로 남긴다). 미지정이면 null */
  requestedChannelId: string | null;
  /** 서버가 정렬 후 잘라낸 상위 N — 정렬을 LLM에 맡기지 않는다 */
  limit: number;
  channels: Array<{
    channelId: string;
    /** 이름 resolve 실패 시 null → 웹은 채널 ID로 대체 렌더(§2A-7) */
    channelName: string | null;
    current: { voiceSeconds: number; messageCount: number };
    previous: { voiceSeconds: number; messageCount: number };
    /** 정렬·감소율 산정 기준은 voiceSeconds(음성이 이 서비스의 1차 활동 신호). 직전 0 → null */
    deltaPercent: number | null;
  }>;
}

/**
 * Q6 — F-024. 경계 3선이 스키마 레벨에서 강제된다:
 *  ① 관계 데이터(co-presence pair·베프·소그룹) 필드가 존재하지 않는다
 *  ② LLM이 만든 평가 라벨을 담을 필드가 존재하지 않는다(등급은 결정론 인용만)
 *  ③ 게임 활동(voice_game_daily) 필드가 존재하지 않는다(D3)
 * Q1과 달리 targetUserId를 담는 이유: 관리자가 질의에서 직접 지목한 1인이며, 그 값을
 * 응답에 되돌려주지 않으면 웹이 "누구에 대한 분석인지" 표시할 수 없다(Q1은 지목 대상이 없다).
 */
export interface MemberActivityMetrics {
  targetUserId: string;
  /** guild_member.displayName 유래(실측 컬럼). 재주입 시 escapeUserText 필수(§2A-6 ⑤) */
  targetDisplayName: string | null;
  /** 최근 4주(오늘 제외, 7일 버킷) */
  weeks: Array<{ weekStartDate: string; voiceSeconds: number; messageCount: number }>;
  level: { level: number; xp: number } | null;
  /** inactive_member_record.grade 결정론 등급의 그대로 인용. LLM이 새 등급을 만들지 않는다 */
  inactiveGrade: 'FULLY_INACTIVE' | 'LOW_ACTIVE' | 'DECLINING' | null;
}

/** Q8 — F-025. 권한 판정은 100% 서버 결정론, LLM은 정렬·서술만 */
export interface StructureLintMetrics {
  findings: Array<{
    rule:
      | 'everyoneRiskyPermission' // ① @everyone 위험 권한 개방
      | 'emptyRole' // ② memberCount=0 && isManaged=false (48h 신선 스냅샷에서만 판정)
      | 'inactiveChannel' // ③ 최근 30일 voice+message 합계 0
      | 'lowActiveChannelRatio' // ④ 채널 수 대비 활성 채널 비율
      | 'hoistOveruse'; // ⑤ hoist 남용
    /** 서버 결정론 판정 — LLM이 바꾸지 않는다 */
    severity: 'warn' | 'info';
    /** 실제 위반 수(상한과 무관) */
    count: number;
    /** 대상은 역할·채널뿐 — 개인(멤버)은 대상이 되지 않는다. 룰당 상한 20건 */
    subjects: Array<{ type: 'role' | 'channel'; id: string; name: string | null }>;
  }>;
  summary: {
    roleCount: number;
    channelCount: number;
    activeChannelCount: number;
    /** 역할 스냅샷 기준 시각(ISO) — 신선도 무관하게 항상 병기(§0-3 완화 ②). 역할 0건이면 null */
    roleSyncedAt: string | null;
  };
}

/**
 * Q1 — F-026. B2 준수 조건 ①·④를 스키마로 강제한다 — 개인 식별자·개인별 점수·라벨을
 * 담을 자리를 만들지 않는다. 아래 필드 외에 members[]/userIds[]/riskScore/label/flaggedUsers
 * 류 필드를 추가하는 변경은 계약 위반이다(회귀 테스트 고정 대상).
 *
 * k-익명성 가드(본 계획 §3 ⑦, N=5): `joinCount < 5`면 `youngAccountCount`/`noActivityCount`는
 * `null`(생략 대신 명시적 null — "표본 부족이라 계산하지 않았다"를 구분), `burst`도 `null`.
 * `maxJoinsPerHour < 2`면 그 시각 가입자가 1명뿐이라 시각 자체가 식별자이므로 `burst`는 null.
 */
export interface NewMemberCohortMetrics {
  /** 7 고정 */
  windowDays: number;
  joinCount: number;
  /** 계정 생성 N일 미만 가입자 "수"(명단 아님). k-익명성 미달 시 null */
  youngAccountCount: number | null;
  youngAccountThresholdDays: number;
  /** 시간 버킷 집계 — 사람이 아니라 시각이 대상이다. k-익명성 미달 또는 버스트 자체 미달 시 null */
  burst: { maxJoinsPerHour: number; peakHourStartAt: string } | null;
  /** 가입 후 무활동 "수"(명단 아님). k-익명성 미달 시 null */
  noActivityCount: number | null;
}

/** 판별자는 recipe(=카탈로그 actionId). metrics는 전부 서버 사전계산 — LLM 미개입 */
export type AdminAssistAnalysis =
  | (AdminAssistAnalysisBase & {
      recipe: 'analytics.activityTrend';
      metrics: ActivityTrendMetrics;
    })
  | (AdminAssistAnalysisBase & {
      recipe: 'analytics.decliningChannels';
      metrics: DecliningChannelsMetrics;
    })
  | (AdminAssistAnalysisBase & {
      recipe: 'analytics.memberActivity';
      metrics: MemberActivityMetrics;
    })
  | (AdminAssistAnalysisBase & {
      recipe: 'analytics.structureLint';
      metrics: StructureLintMetrics;
    })
  | (AdminAssistAnalysisBase & {
      recipe: 'analytics.newMemberCohort';
      metrics: NewMemberCohortMetrics;
    });

export interface AdminAssistRecommendResponse {
  resultStatus: AdminAssistResultStatus;
  /** Phase 2a 신규 — 웹의 2차 분기 키(§2A-1). no_match/rejected/llm_error면 null */
  kind: AdminAssistKind | null;
  /** kind==='setting' && resultStatus==='success'일 때만 non-null (Phase 1 무변경) */
  recommendation: AdminAssistRecommendation | null;
  /** Phase 2a 신규 — kind==='recipe' && (success | partial_success)일 때만 non-null */
  analysis: AdminAssistAnalysis | null;
  /** no_match / rejected일 때만 non-null (Phase 1 무변경) */
  fallback: AdminAssistFallback | null;
  /** 응답 카드 하단 후속 칩 1~2개(F-015). 카탈로그 파생 결정론 — LLM 미개입 */
  followUpQueries: string[];
  /** 이번 요청 반영 후 쿼터 스냅샷 — 헤더 "잔여 N/20" 갱신용 */
  quota: AdminAssistQuotaResponse;
}

export interface AdminAssistCatalogItem {
  /** 닫힌 enum 값 — 추천 응답의 recommendation.actionId와 동일 공간 */
  actionId: string;
  /** locale 반영 표시 제목 */
  title: string;
  /** 칩 문구 소스(H2) — 하드코딩 금지. 요청 locale 분량만 내려온다 */
  exampleQueries: string[];
  /** 신규 길드 모드(F-016)에서 우선 노출할 온보딩 훅 항목인지 */
  isOnboarding: boolean;
  /** Phase 2a 신규 — 웹 칩 kind 균형 샘플링(§3 ⑫)에 사용 */
  kind: AdminAssistKind;
}

export interface AdminAssistCatalogResponse {
  items: AdminAssistCatalogItem[];
  /** 회고·재현용 프롬프트/카탈로그 버전 태그(이력 promptVersion과 동일 값) */
  promptVersion?: string;
}

/** F-ADMIN-ASSIST-033 — E4/E5 응답. 미설정 길드는 두 필드 모두 null(404 아님, EP §5B-1). */
export interface AdminAssistContextResponse {
  /** 저장된 규칙 텍스트 원문(trim 적용본). 행 부재 시 null, 빈 문자열 저장 시 '' */
  rulesText: string | null;
  /** ISO 8601. 행 부재 시 null */
  updatedAt: string | null;
}
