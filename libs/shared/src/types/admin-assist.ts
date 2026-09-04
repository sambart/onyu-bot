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

/** F-ADMIN-ASSIST-059(M3) — 질의가 발생한 UI 표면. `AdminAssistSource`(질의 트리거)와
 *  직교하는 별도 축이며 병합·대체하지 않는다. 주의: 카탈로그의
 *  `getSurfaceableExampleQueries()`("노출 가능한")와 의미가 전혀 다르다. */
export type AdminAssistSurface = 'overview_card' | 'side_panel';

/**
 * 매칭된 카탈로그 항목의 종류(F-ADMIN-ASSIST-019 판별자). 매칭 실패 시 응답에서 null.
 * `'generative'`(admin-assist-generative-authoring 계획 §0-2) — LLM이 공지·규칙 초안을
 * 생성하는 항목(F-042). `setting`/`recipe`와 달리 사전계산·설정 딥링크가 없다.
 */
export type AdminAssistKind = 'setting' | 'recipe' | 'generative';

/**
 * 규칙 초안 제안(`generate.rulesProposal`)의 서버 유형 3값(F-042, admin-assist-generative-
 * authoring 계획 §0-3). 웹 전용 `ServerType`(`settings-preset.ts`)의 4값(`GAME`|`COMMUNITY`|
 * `STUDY`|`MANUAL`) 중 `MANUAL`을 제외한 부분집합이며 본 타입이 정본이다 — API는 웹 전용
 * 파일을 import할 수 없어(실측 X) 웹이 이 타입과 자기 `ServerType`을 대조한다.
 */
export type AdminAssistServerType = 'GAME' | 'COMMUNITY' | 'STUDY';

/** 생성형 카탈로그 항목의 닫힌 actionId 2값(F-042·050). */
export type AdminAssistGenerativeAction = 'generate.announcementDraft' | 'generate.rulesProposal';

export interface AdminAssistParameter {
  key: string;
  /** locale 반영 표시 라벨 */
  label: string;
  /** isValidated=false 면 항상 null → 웹은 "제안값 없음"으로 렌더(F-005, admin-assist-response-quality 계획 §0-9 ⓚ) */
  value: string | number | boolean | null;
  /** 서버측 재검증(F-005) 통과 여부 */
  isValidated: boolean;
}

export interface AdminAssistRecommendation {
  /** 카탈로그 닫힌 enum 값(예: 'newbie.welcome'). 이력 recipeId와 동일 값 */
  actionId: string;
  /** 카탈로그 description 파생 제목(locale 반영) */
  title: string;
  /**
   * N1(b) 템플릿 문장(admin-assist-response-quality 계획 §0-3 ⓒ·§0-5 ⓔ) — 질의 인정 + "안내
   * 이지 적용 아님" 명시 + 다음 행동 3요소로 서버가 조립한다. 소스는 `libs/i18n`이 아니라
   * `apps/api` 모듈 로컬 ko/en 로케일 테이블이다(카탈로그 `title`·`parameters[].label` 보간,
   * 결정 ⓐ — LLM이 자유 텍스트로 생성하지 않는다). 이력 `admin_assist_history.responseText`
   * 와 **문자열이 동일**하다 — §23-5 N1 재전송률 판독이 DB 쪽 값을 읽으므로, 화면과 이력이
   * 갈리면 그 지표가 무효화된다(EC-AA-271).
   */
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
  /**
   * F-ADMIN-ASSIST-065(N4) — 결정론 안내 코드(현재는 이름 해석 실패 2코드).
   * 필수 필드 · 해당 없으면 빈 배열(undefined 금지). 강등 내성: 폴백 콜이 실패해
   * `generatedGuidance:null`이 돼도 사유는 이 코드로 전달된다(endpoint-spec §2F-5 (a)안 채택 근거).
   */
  notices: AdminAssistAnalysisNoticeCode[];
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
 * - `server_type_defaulted`: `generate.rulesProposal` — `serverType` 미지정/무효 시 서버가
 *   `COMMUNITY`로 폴백함(admin-assist-generative-authoring 계획 §0-3, EC-AA-199 — `rejected`
 *   승격 아님). 이름에 "Analysis"가 남는 것은 생성형 경로도 이 코드표를 공유하기 위한
 *   의도적 재사용이다.
 * - `target_name_not_found`: Q6 — `targetName` 정확 일치 0건 && (접두 일치 0건 || 길이
 *   하한 미달). 후보 0명(F-ADMIN-ASSIST-065, N4, endpoint-spec §2F-5)
 * - `target_name_ambiguous`: Q6 — `targetName` 정확 일치 2건 이상 또는 접두 일치 2건 이상.
 *   후보 1~5명(F-ADMIN-ASSIST-065, N4, endpoint-spec §2F-5·§2F-6)
 */
export type AdminAssistAnalysisNoticeCode =
  | 'interpretation_unavailable'
  | 'no_comparable_data'
  | 'channel_not_found_scanned_all'
  | 'channel_names_unavailable'
  | 'insufficient_cohort_sample'
  | 'role_snapshot_stale'
  | 'server_type_defaulted'
  | 'target_name_not_found'
  | 'target_name_ambiguous';

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

/**
 * 생성형 경로(`kind==='generative'`) 응답 공통 필드(admin-assist-generative-authoring
 * 계획 §0-8 결정 ⓖ).
 */
interface AdminAssistGenerationBase {
  /** 카탈로그 title 파생(UI locale) — LLM 미생성 */
  title: string;
  /** 초안이 실제로 작성된 언어(F-045). UI locale과 다를 수 있다(언어 선택 컨트롤) */
  writeLocale: 'ko' | 'en';
  /** 공지는 항상 [], 규칙 제안은 `serverType` 1개(서버 재검증 투영) */
  parameters: AdminAssistParameter[];
  notices: AdminAssistAnalysisNoticeCode[];
}

/** 생성형 경로(F-042·043·050) 판별 유니온 — 판별자는 `action`. */
export type AdminAssistGeneration =
  | (AdminAssistGenerationBase & {
      action: 'generate.announcementDraft';
      /** LLM 생성 — 표시 전용(mutation 0). 관리자가 편집 후 게시한다 */
      draft: { title: string; body: string };
    })
  | (AdminAssistGenerationBase & {
      action: 'generate.rulesProposal';
      draft: { body: string };
      /** 웹 유형 전환 UI 초기값(미지정 시 서버가 `COMMUNITY`로 확정한 값) */
      serverType: AdminAssistServerType;
    });

export interface AdminAssistRecommendResponse {
  resultStatus: AdminAssistResultStatus;
  /** Phase 2a 신규 — 웹의 2차 분기 키(§2A-1). no_match/rejected/llm_error면 null */
  kind: AdminAssistKind | null;
  /** kind==='setting' && resultStatus==='success'일 때만 non-null (Phase 1 무변경) */
  recommendation: AdminAssistRecommendation | null;
  /** Phase 2a 신규 — kind==='recipe' && (success | partial_success)일 때만 non-null */
  analysis: AdminAssistAnalysis | null;
  /** kind==='generative' && resultStatus==='success'일 때만 non-null(admin-assist-generative-authoring 계획 §0-8) */
  generation: AdminAssistGeneration | null;
  /** no_match / rejected일 때만 non-null (Phase 1 무변경) */
  fallback: AdminAssistFallback | null;
  /**
   * `admin_assist_history` INSERT 성공 시의 행 id(전 경로 공통, kind 무관). `null`은 오직
   * 이력 INSERT가 실패했을 때뿐이다(best-effort — 응답에 영향 없음, EC-AA-187). 게시
   * 대상이 아닌 경로의 값은 웹이 그냥 쓰지 않는다(admin-assist-generative-authoring 계획 §0-8).
   */
  historyId: string | null;
  /** 응답 카드 하단 후속 칩 1~2개(F-015). 카탈로그 파생 결정론 — LLM 미개입 */
  followUpQueries: string[];
  /** 이번 요청 반영 후 쿼터 스냅샷 — 헤더 "잔여 N/20" 갱신용 */
  quota: AdminAssistQuotaResponse;
}

/**
 * E6 — 생성형 초안(편집본)을 디스코드 채널에 게시하는 요청(F-046, admin-assist-generative-
 * authoring 계획 §0-10·§0-13). `historyId`는 best-effort 회고 연결용이며 부재/무효여도
 * 게시는 항상 성공한다(EC-AA-187).
 */
export interface AdminAssistPublishRequest {
  channelId: string;
  sourceAction: AdminAssistGenerativeAction;
  /** 규칙 제안(`generate.rulesProposal`)은 제목이 없다(F-051) — 이때 생략 */
  title?: string;
  body: string;
  writeLocale?: 'ko' | 'en';
  historyId?: string;
}

export interface AdminAssistPublishResponse {
  success: true;
  channelId: string;
  messageId: string;
  /** ISO 8601 — 미리보기 "게시 완료 · HH:mm"과 `executedAction.publishedAt` 값이 일치한다 */
  publishedAt: string;
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

/**
 * E7 — 결과 카드 👍/👎 피드백 요청(F-ADMIN-ASSIST-064, N6). 닫힌 2값(endpoint-spec §5D-2) —
 * 서버가 5/1로 매핑해 저장한다. 매핑 상수는 `apps/api` 안에만 둔다(웹이 숫자 의미를 몰라도
 * 되게 하기 위함 — admin-assist-response-quality 계획 §0-8).
 */
export type AdminAssistFeedback = 'up' | 'down';

export interface AdminAssistRatingRequest {
  feedback: AdminAssistFeedback;
}

/**
 * E7 응답 — 갱신 결과의 최소 투영. 이력 행 전문을 내리지 않는다(§8 열람 표면 비생성 계약,
 * endpoint-spec §5D-5). `rating`은 서버가 매핑해 저장한 숫자값(👍=5 / 👎=1)이며, 웹은 이
 * 값을 해석할 필요가 없다 — 어느 버튼을 눌렀는지는 웹이 이미 안다.
 */
export interface AdminAssistRatingResponse {
  historyId: string;
  rating: number;
}
