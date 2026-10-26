// admin-assist 도메인 공유 타입 — Phase 1(추천 내비게이터) + Phase 2a(분석 레시피) 웹↔API 계약
// docs/specs/endpoint-spec/admin-assist.md §2-2·§4-2·§5-2·§2A 정본

import type { AdminAssistExecutableActionId } from '../constants/admin-assist';
import type { SupportedLocale } from '../constants/locale';
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

/**
 * F-ADMIN-ASSIST-059(M3) — 질의가 발생한 UI 표면. `AdminAssistSource`(질의 트리거)와
 * 직교하는 별도 축이며 병합·대체하지 않는다. 주의: 카탈로그의
 * `getSurfaceableExampleQueries()`("노출 가능한")와 의미가 전혀 다르다.
 *
 * `'bot_slash'`(F-ADMIN-ASSIST-081, M4/A2) — 봇 슬래시 커맨드 진입점(source는 항상 'free' 고정).
 * ⚠️ 'bot_slash' 는 서버(bot-api 컨트롤러)가 상수로만 채운다. 웹 요청 DTO 화이트리스트
 *    (ADMIN_ASSIST_WEB_SURFACES) 에는 절대 추가하지 않는다 — 추가하면 웹 사용자가 봇 표면
 *    모수를 위조할 수 있다(endpoint-spec §5E-4).
 *
 * `'weekly_report'`(F-ADMIN-ASSIST-115, P1-23 A15) — 주간 리포트 딥링크(`?assist=weekly_report`)로
 * 열린 사이드 패널의 질의. 동작은 'side_panel' 과 동일하고 기록 값만 다르다(G5 push 실험 집계용).
 * 웹이 직접 싣는 값이므로 웹 DTO 화이트리스트에 포함된다('bot_slash' 와 반대).
 */
export type AdminAssistSurface = 'overview_card' | 'side_panel' | 'bot_slash' | 'weekly_report';

/**
 * 매칭된 카탈로그 항목의 종류(F-ADMIN-ASSIST-019 판별자). 매칭 실패 시 응답에서 null.
 * `'generative'`(admin-assist-generative-authoring 계획 §0-2) — LLM이 공지 초안을
 * 생성하는 항목(F-042). `setting`/`recipe`와 달리 사전계산·설정 딥링크가 없다.
 */
export type AdminAssistKind = 'setting' | 'recipe' | 'generative';

/**
 * 생성형 카탈로그 항목의 닫힌 actionId(F-042). 규칙 초안(`generate.rulesProposal`)은
 * 2026-09-29 서버 규칙 축 제거(리뷰 D1 (a))로 삭제됐다 — 과거 이력 행의 `recipeId` 로만
 * 남는다(D4 (a) 보존). 이력 소비처는 이 타입이 아니라 `string` 으로 recipeId 를 다룬다.
 */
export type AdminAssistGenerativeAction = 'generate.announcementDraft';

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
  /**
   * (b1) 상태 점검 섹션(F-ADMIN-ASSIST-095) — 진단기를 가진 항목(`level.enable`·
   * `inactive-member.criteria`)의 success 응답에만 붙는다(intentClass 무관). 그 외 항목은 필드
   * 생략. 옵셔널 additive — 필드 도입 전 세션 스냅샷·구버전 응답에는 없다.
   */
  diagnosis?: AdminAssistDiagnosis | null;
  /**
   * Phase 3 승인-실행(F-ADMIN-ASSIST-101) — 등급 ① 설정 액션의 읽기 전용 diff 제안. 생략 = 제안 대상 아님
   * (등급 ③, 봇 표면, 킬 스위치 off, usage_question). 옵셔널이라 구버전 소비처는 무회귀.
   */
  proposal?: AdminAssistProposal;
}

/** (b1) 상태 점검 항목의 표시 상태 — issue(확인 필요) · ok(정상) · check(직접 확인) · info(참고) */
export type AdminAssistDiagnosisStatus = 'issue' | 'ok' | 'check' | 'info';

export interface AdminAssistDiagnosisItem {
  /** 'LV_DISABLED' 등 — 웹·봇은 표시에 쓰지 않는다(테스트·관측용) */
  code: string;
  status: AdminAssistDiagnosisStatus;
  /** 서버 조립 문장(locale 반영) — 식별자·채널명·역할명을 담지 않는다(개수만) */
  text: string;
}

export interface AdminAssistDiagnosis {
  domain: 'level' | 'inactive-member';
  /** `unavailable` — 조회 실패·예산 초과. `items` 는 정적 체크리스트를 `check` 로 변환한 목록 */
  outcome: 'evaluated' | 'unavailable';
  items: AdminAssistDiagnosisItem[];
  /** 멤버 본인 XP 확인 경로 안내(레벨만) — 없으면 null */
  selfCheckHint: string | null;
}

/**
 * C-lite 설명 슬롯(F-ADMIN-ASSIST-094) — 설정형 항목이 `usage_question` 으로 판정된 success
 * 응답에만 붙는다. 본문은 서버 카탈로그 상수(LLM 미생성).
 */
export interface AdminAssistExplanation {
  /** 카탈로그 explanation(locale 반영) — 문단 1개 */
  body: string;
  /** 정적 체크리스트 — 진단(`recommendation.diagnosis`)이 붙은 응답에서는 빈 배열(중복 방지) */
  troubleshooting: string[];
  /** 웹 가이드 슬러그. 서버는 slug 만 내리고 경로·locale 접두는 클라이언트가 만든다 */
  guideSlug: string | null;
}

/**
 * F-ADMIN-ASSIST-072(D1, D2) — `fallback.suggestedActionId`가 지목한 카탈로그 항목의 렌더
 * 재료. 서버가 카탈로그를 조회해 완성한다(웹은 파생 계산을 하지 않는다 — endpoint-spec §2I-1
 * "서버가 완성 딥링크까지 내린다"). 현재는 `kind==='setting'`(딥링크 보유) 항목만 이 객체가
 * 채워진다 — `recipe`/`generative` actionId를 지목해도 `suggestedActionId`는 유지되지만
 * `suggestedAction`은 `null`이다(1차 범위를 설정형 딥링크로 좁힌 결정 — 딥링크 없는 항목의
 * 재질의 칩은 다음 라운드로 미룬다).
 */
export interface AdminAssistFallbackSuggestion {
  /** 카탈로그 title 파생(locale 반영) — LLM 미생성 */
  title: string;
  /** :guildId 치환이 끝난 완성 경로(예: '/settings/guild/123/newbie') */
  settingsDeepLink: string;
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
  /**
   * F-ADMIN-ASSIST-072(D1, 6차 실측 후속, §0-1 세 축 구분) — `no_match` 응답이 지목한 카탈로그
   * `actionId`(닫힌 enum) 또는 `null`(지목 대상 없음). **`resultStatus`가 여전히 `'no_match'`
   * 이고 `recommendation`/이력 `recipeId`가 여전히 `null`인 것과 무관하다** — "매칭됐다면
   * 애초에 success였을 것"이라는 양방향 불변식은 라우팅 층(F-ADMIN-ASSIST-074)이 별도로
   * 보장한다. `'no_match'` 센티널 문자열은 이 필드의 값이 될 수 없다(라우팅 콜의 actionId
   * 센티널과 다른 축). `resultStatus==='rejected'`에서는 항상 `null`(이미 matchedEntry가
   * 있어 이 필드가 필요 없다).
   */
  suggestedActionId: string | null;
  /**
   * `suggestedActionId`의 렌더 재료(딥링크 칩 근거). **단방향 종속** — `suggestedAction`이
   * non-null이면 `suggestedActionId`도 반드시 non-null이다(역은 성립하지 않는다).
   * `suggestedActionId`가 non-null이어도 그 항목이 딥링크를 갖지 않는 kind(`recipe`/
   * `generative`)면 `suggestedAction`은 `null`이다(1차 범위를 설정형 딥링크로 좁힌 결정 —
   * 위 타입 docblock 참조). 두 필드가 함께 non-null인 것은 `kind==='setting'`일 때뿐이다.
   */
  suggestedAction: AdminAssistFallbackSuggestion | null;
  /**
   * F-ADMIN-ASSIST-087(no_match 리뷰 A3 A+ · 프롬프트 v10) — `no_match` 종결에서 라우팅 콜이
   * `intentClass='unsupported_feature'`(미지원 기능 요청)로 분류했고 **이력 행 INSERT 가 실제로
   * 성공했을 때만** `true`다(`historyId !== null`). `true`면 웹·봇이 각자 `libs/i18n` 에서
   * "지원하지 않는 기능 요청으로 기록해 두었어요" 1문장을 렌더한다 — 서버는 문구가 아니라
   * 판정만 내린다(F-086 `isQueryLanguageUnsupported` 관행). 기록이 사실일 때만 말하게 하려고
   * 이력 INSERT 결과에 묶었다("검토하겠다" 류 약속 문구는 두지 않는다). 옵셔널 — 필드 도입 전
   * 세션 복원 스냅샷·`rejected` 경로에는 없으므로 부재는 `false`로 취급한다.
   */
  isUnsupportedRequestLogged?: boolean;
}

/** GET /api/guilds/:guildId/admin-assist/quota 응답 (F-ADMIN-ASSIST-007) */
export interface AdminAssistQuotaResponse extends QuotaItemBase {
  scope: 'admin-assist';
}

// ── Phase 2a — 분석 결과 (endpoint-spec §2A-2~§2A-4) ────────────────────────

/**
 * 결정론 안내 코드 — 문구가 아니라 코드를 내린다. 웹이 `libs/i18n`에서 문구를 렌더한다.
 * - `interpretation_unavailable`: 2콜 해석 실패 → partial_success(§2A-5)
 * - `no_comparable_data`: Q5 — 두 구간 모두 0(F-022 폴백) / Q3 — scope=all 이고 활동 기록 0건
 *   (빈 목록 ⇔ 활동 행 0, "감소 채널 0"이 아니다. 둘 다 해석 콜을 건너뛴다)
 * - `channel_not_found_scanned_all`: Q3 — channelId 재검증 실패 → 전체 스캔 폴백(F-029)
 * - `channel_names_unavailable`: Q3·Q8 — 채널 이름 resolve 실패(§2A-7). 분석 자체는 유효
 * - `insufficient_cohort_sample`: Q1 — k-익명성 미달(joinCount<5, 본 계획 §3 ⑦ 신설)
 * - `role_snapshot_stale`: Q8 — 역할 스냅샷이 48시간을 넘겨 룰 ②를 보류함(본 계획 §0-3 신설)
 *   (규칙 초안 전용 `server_type_defaulted` 는 2026-09-29 서버 규칙 축 제거로 삭제됐다.
 *   이름에 "Analysis"가 남는 것은 생성형 경로도 이 코드표를 공유하기 위한 의도적 재사용이다.)
 * - `target_name_not_found`: Q6 — `targetName` 정확 일치 0건 && (접두 일치 0건 || 길이
 *   하한 미달). 후보 0명(F-ADMIN-ASSIST-065, N4, endpoint-spec §2F-5)
 * - `target_name_ambiguous`: Q6 — `targetName` 정확 일치 2건 이상 또는 접두 일치 2건 이상.
 *   후보 1~5명(F-ADMIN-ASSIST-065, N4, endpoint-spec §2F-5·§2F-6)
 * - `activity_data_insufficient`: Q8 — 길드 활동 추적 시작 후 관측 일수가 부족해(봇 가입 직후 등)
 *   룰 ③④(비활동 채널·활성 채널 비율)를 보류함. `summary.activeChannelCount`는 `null`
 *   (F-ADMIN-ASSIST-088, 7차 실측 A12 — 데이터 부재를 "서버 전체 비활성"으로 단정하던 결함 수리)
 */
export type AdminAssistAnalysisNoticeCode =
  | 'interpretation_unavailable'
  | 'no_comparable_data'
  | 'channel_not_found_scanned_all'
  | 'channel_names_unavailable'
  | 'insufficient_cohort_sample'
  | 'role_snapshot_stale'
  | 'target_name_not_found'
  | 'target_name_ambiguous'
  | 'activity_data_insufficient';

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
  /**
   * F-088 parity(8차 A4) — 길드 활동 추적 시작 후 관측 일수(당일 포함). null = 추적 시작일 없음.
   * 옵셔널: 구버전 응답·기존 픽스처와 호환. 웹·봇은 읽지 않고 해석 프롬프트 재료로만 쓴다.
   */
  trackingObservedDays?: number | null;
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
  /**
   * F-088 parity(8차 A4) — 길드 활동 추적 시작 후 관측 일수(당일 포함). null = 추적 시작일 없음.
   * 옵셔널: 구버전 응답·기존 픽스처와 호환. 웹·봇은 읽지 않고 해석 프롬프트 재료로만 쓴다.
   */
  trackingObservedDays?: number | null;
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
    /**
     * 최근 30일 활동이 있는 린트 대상 채널 수. **`null` = 측정 보류**(F-ADMIN-ASSIST-088) —
     * 활동 추적 관측 일수가 부족해(봇 가입 직후 등) 0 과 "측정 전"을 구분할 수 없을 때다.
     * 이때 notices 에 `activity_data_insufficient` 가 실리고 룰 ③④ finding 은 만들지 않는다.
     */
    activeChannelCount: number | null;
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
  /**
   * 첫 주 음성 집계 모수(A7 C1) — `joinCount` 와 **다른 모수**다. 가입일(KST)이 오늘 기준
   * 8~14일 전이라 첫 주 창 [가입일, 가입일+7일] 이 어제까지 끝난 멤버 중, 길드 추적 시작일
   * (`resolveTrackingSince`) 이후 가입자만 센다. 최근 7일 가입자는 첫 주가 끝나지 않아
   * 구조적으로 섞이지 않는다(측정 리뷰 2026-09-15 §10.4 #1·#2).
   */
  firstWeekVoiceMeasuredCount: number;
  /** 첫 주 음성(채널 행 체류) 30분(1800초) 이상 "수". 모수가 k-익명성 미달이면 null */
  firstWeekVoice30PlusCount: number | null;
  /** 첫 주 음성 30분 미만(0 포함) "수". 모수가 k-익명성 미달이면 null */
  firstWeekVoiceUnder30Count: number | null;
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
  writeLocale: SupportedLocale;
  /** 공지 초안은 파라미터가 없어 항상 [] */
  parameters: AdminAssistParameter[];
  notices: AdminAssistAnalysisNoticeCode[];
}

/**
 * 생성형 경로(F-042·043) 응답 — 판별자는 `action`. 규칙 초안 분기(`generate.rulesProposal`)는
 * 2026-09-29 서버 규칙 축 제거로 삭제돼 현재 공지 초안 1종이다.
 */
export type AdminAssistGeneration = AdminAssistGenerationBase & {
  action: 'generate.announcementDraft';
  /** LLM 생성 — 표시 전용(mutation 0). 관리자가 편집 후 게시한다 */
  draft: { title: string; body: string };
};

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
  /**
   * F-ADMIN-ASSIST-086(6차 실측 D3 (b)) — 질의가 지원 언어(ko/en) 밖의 문자 체계로 쓰였는지
   * (서버 결정론 판정, resultStatus 무관 전 200 경로). `true`면 웹·봇이 각자 `libs/i18n` 에서
   * "현재 한국어·영어만 지원" 안내 1문장을 렌더한다 — 서버는 문구가 아니라 판정만 내린다.
   * 응답 언어(locale)는 바꾸지 않는다. 옵셔널 — 서버는 항상 채우지만, 필드 도입 전 세션
   * 복원 스냅샷·구버전 API 응답에는 없으므로 부재는 `false`로 취급한다.
   */
  isQueryLanguageUnsupported?: boolean;
  /**
   * C-lite 설명 슬롯(F-ADMIN-ASSIST-094) — 설정형 success + `intentClass==='usage_question'`
   * 일 때만 채운다. 그 외에는 필드 생략. 옵셔널 additive — 부재는 "설명 없음".
   */
  explanation?: AdminAssistExplanation | null;
}

/**
 * E6 — 생성형 초안(편집본)을 디스코드 채널에 게시하는 요청(F-046, admin-assist-generative-
 * authoring 계획 §0-10·§0-13). `historyId`는 best-effort 회고 연결용이며 부재/무효여도
 * 게시는 항상 성공한다(EC-AA-187).
 */
export interface AdminAssistPublishRequest {
  channelId: string;
  sourceAction: AdminAssistGenerativeAction;
  /** 비어 있으면 Embed title 을 생략한다(옵셔널 계약 유지 — 예전 규칙 초안 게시의 흔적) */
  title?: string;
  body: string;
  writeLocale?: SupportedLocale;
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
  /**
   * B-lite(제한 대화, admin-assist-limited-dialogue-v9 계획 §6-3) — 서버 env 플래그
   * `ADMIN_ASSIST_LIMITED_DIALOGUE_ENABLED`의 반영값. 웹은 별도 env를 두지 않고 이 필드
   * 1개를 단일 소스로 쓴다. 옵셔널 — 구버전 API 대응(off로 취급).
   */
  isLimitedDialogueEnabled?: boolean;
}

/**
 * F-ADMIN-ASSIST-070 — E8(GET publish-history) 응답 행. `admin_assist_history`의
 * `executedAction IS NOT NULL`(게시 성공) 행만 담는다. PRD 계약 "전부 기존 컬럼, 신규 파생
 * 없음" — `executorDisplayName` 등 신규 파생 필드를 추가하지 않는다(admin-action-history-undo
 * 계획 §4.3 C3). `id`는 `bigint` PK라 TS 타입은 `string`이다.
 */
export interface AdminAssistPublishHistoryItem {
  id: string;
  createdAt: string;
  userId: string;
  /**
   * 현재는 'generate.announcementDraft' | null. 규칙 초안 제거(2026-09-29) 이전 행은
   * 'generate.rulesProposal' 일 수 있다(프로덕션 게시 0건이나 계약상 열어 둔다) — 소비처는
   * 알 수 없는 값을 폴백 라벨로 렌더해야 한다.
   */
  recipeId: string | null;
  queryText: string;
  responseText: string | null;
  executedAction: { channelId: string; messageId: string; publishedAt: string };
}

/** 페이지네이션 없음(최근 20건 고정 상한) — `total`/`page` 필드를 두지 않는다. */
export interface AdminAssistPublishHistoryResponse {
  items: AdminAssistPublishHistoryItem[];
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

// ── Phase 3 승인-실행 (docs/plans/admin-assist-phase3-approval.md §3-P0, F-ADMIN-ASSIST-099~114) ──

/** proposal 이 `link_only` 인 사유 (D-4: `out_of_range` 포함 5값) */
export type AdminAssistProposalLinkOnlyReason =
  | 'no_explicit_value'
  | 'out_of_range'
  | 'read_failed'
  | 'precondition_unmet'
  | 'no_change';

/** 승인 카드 diff 한 줄. 값은 boolean 또는 정수만(digest 정규화 입력 제약, D-6) */
export interface AdminAssistProposalChange {
  key: string;
  label: string;
  before: boolean | number;
  after: boolean | number;
}

export interface AdminAssistExecutableProposal {
  executability: 'executable';
  changes: AdminAssistProposalChange[];
  impact: string[];
  revert: { note: string; settingsDeepLink: string };
  /** ISO 8601 — E1 은 표시용 근사(now + TTL), E9 409 details 는 행 createdAt + TTL */
  expiresAt: string;
  /** sha256 소문자 hex 64자 */
  previewDigest: string;
}

export interface AdminAssistLinkOnlyProposal {
  executability: 'link_only';
  reason: AdminAssistProposalLinkOnlyReason;
}

export type AdminAssistProposal = AdminAssistExecutableProposal | AdminAssistLinkOnlyProposal;

/** E9 요청 body */
export interface AdminAssistExecuteRequest {
  previewDigest: string;
}

/** E9 200 응답 */
export interface AdminAssistExecuteResponse {
  success: true;
  actionId: AdminAssistExecutableActionId;
  changes: AdminAssistProposalChange[];
  executedAt: string;
  settingsDeepLink: string;
  /** 1차 값: 'POST_SAVE_STEP_FAILED'. 없으면 키 생략 */
  warnings?: string[];
}

/** E9 에러 응답 최상위 `details` (409 PREVIEW_STALE / ALREADY_EXECUTED) */
export type AdminAssistExecuteErrorDetails =
  | { proposal: AdminAssistExecutableProposal }
  | { result: AdminAssistExecuteResponse };

/** E9 422 `NOT_EXECUTABLE` 의 `params.reason` (D-20) */
export type AdminAssistExecuteNotExecutableReason =
  | 'not_executable_action'
  | 'bot_surface'
  | 'result_not_success'
  | 'intent_mismatch'
  | 'precondition_unmet'
  | 'no_change'
  | 'no_explicit_value'
  | 'out_of_range';

/** E9 422 `DOMAIN_REJECTED` 의 `params.domainCode` */
export type AdminAssistExecuteDomainCode = 'DTO_VALIDATION_FAILED' | 'LEVEL_ROLE_REJECTED';

/** `executedAction.type='setting'` 진행 중(claim) 상태 */
export interface AdminAssistExecutedSettingClaim {
  type: 'setting';
  status: 'executing';
  actionId: AdminAssistExecutableActionId;
  /** ISO 8601 (앱 시계, ms 정밀도 — D-7) */
  claimedAt: string;
}

/** `executedAction.type='setting'` 마감(applied) 상태. `label` 은 저장하지 않는다(F-106) */
export interface AdminAssistExecutedSettingApplied {
  type: 'setting';
  status: 'applied';
  actionId: AdminAssistExecutableActionId;
  claimedAt: string;
  executedAt: string;
  changes: Array<{ key: string; before: boolean | number; after: boolean | number }>;
  previewDigest: string;
  warnings?: string[];
}

export type AdminAssistExecutedSettingAction =
  | AdminAssistExecutedSettingClaim
  | AdminAssistExecutedSettingApplied;

/** 기존 게시 성공 기록(`type` 은 레거시 행에서 생략될 수 있다 — 판별 시 COALESCE 'publish') */
export interface AdminAssistExecutedPublishAction {
  type?: 'publish';
  channelId: string;
  messageId: string;
  publishedAt: string;
}

/** `admin_assist_history.executedAction` 유니온 */
export type AdminAssistExecutedAction =
  | AdminAssistExecutedPublishAction
  | AdminAssistExecutedSettingAction;

/** `paramsJson.__proposal` 관측 키 (F-114 ①⑦) */
export interface AdminAssistProposalObservation {
  executability: 'executable' | 'link_only';
  reason?: AdminAssistProposalLinkOnlyReason;
}

/** `paramsJson.__executeFailure` — claim 이후 실패 마지막 1건 (U-17) */
export interface AdminAssistExecuteFailureObservation {
  code: 'DOMAIN_REJECTED' | 'EXECUTION_FAILED';
}

/** 사전 거절(0~6단계)로 `paramsJson.__executeRejection.code` 에 기록되는 사유 코드 */
export type AdminAssistExecuteRejectionCode =
  | 'VALIDATION_FAILED'
  | 'PREVIEW_STALE'
  | 'ALREADY_EXECUTED'
  | 'EXECUTION_IN_PROGRESS'
  | 'PROPOSAL_EXPIRED'
  | 'NOT_EXECUTABLE'
  | 'EXECUTION_DISABLED';

/** `paramsJson.__executeRejection` — 사전 거절 관측 키 (QA §BE-1, DDL 0). `reason` 은 NOT_EXECUTABLE 일 때만 */
export interface AdminAssistExecuteRejectionObservation {
  code: AdminAssistExecuteRejectionCode;
  reason?: AdminAssistExecuteNotExecutableReason;
}
