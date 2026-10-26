/**
 * AI 리포트 파이프라인 공유 타입(F-GEMINI-035 — 2026-10-01 리포트 파이프라인 재구조화 P1).
 *
 * 파이프라인 코어(① 지표 계산 · ② 데이터 부족 감지)는 `apps/api` 의 순수 함수 모듈이 산출하고,
 * 웹이 렌더해야 하는 결과(`ai-insight` 응답의 `sufficiency`·`metrics`)만 여기 둔다.
 * 🔒 지표는 길드 단위 집계 수치뿐이다 — 유저 ID·이름이 들어갈 필드가 타입상 존재하지 않는다
 * (server-diagnosis PRD §5.2 "파생 집계 수치").
 */

import type { PremiumFeatureKey } from './subscription';

/** 리포트 지표 키(①). 전부 길드 단위 집계값이다. */
export type ReportMetricKey =
  | 'activeUsers'
  | 'totalVoiceSec'
  | 'avgDailyActiveUsers'
  | 'activeDays'
  | 'micOnRatio'
  | 'streamingSec'
  | 'videoSec'
  | 'voiceSecPerActiveUser'
  | 'top5UserShare'
  | 'top1ChannelShare'
  | 'returningUserRate'
  | 'newUserCount'
  | 'healthScore';

/** 지표 단위 — `ratio` 는 0~1 소수(표시 시 ×100), `sec` 는 초 */
export type ReportMetricUnit = 'count' | 'sec' | 'ratio' | 'score';

export interface ReportMetric {
  key: ReportMetricKey;
  unit: ReportMetricUnit;
  current: number;
  /** 직전 기간 값. 직전 기간 미관측이거나 그 지표를 직전 기간에 산출하지 못하면 null */
  previous: number | null;
  /** current − previous. 비교 불가(`comparable:false`)면 null */
  deltaAbs: number | null;
  /**
   * 증감률(%, 소수 1자리). 비교 불가이거나 직전 값이 % 억제 하한 미만(인원 3명 · 시간 1시간)이면
   * null — "1명→3명 = +200%" 같은 과장을 막는다. `ratio`·`score` 단위는 항상 null(절대 증감만).
   */
  deltaPct: number | null;
  /** 직전 기간이 창 전체를 관측했고 직전 값이 있을 때만 true */
  comparable: boolean;
}

/** ② 데이터 충분도 등급 — insufficient: LLM 미호출 · limited: 요약만 · sufficient: 전체 */
export type SufficiencyLevel = 'insufficient' | 'limited' | 'sufficient';

export type SufficiencyReason =
  /** 길드 관측일수 < 최소 관측일(7일) */
  | 'collecting'
  /** 창 안 활동일 < 기준 */
  | 'few_active_days'
  /** 활성 유저 < 기준 */
  | 'few_active_users'
  /** 총 음성 시간 < 기준 */
  | 'low_volume'
  /** 직전 기간이 창 전체를 관측하지 못해 증감 비교 불가 */
  | 'no_comparable_prev';

/** 판정에 쓴 기준값 — 웹이 "도달 조건"(예: 활성 인원 3명 이상)을 안내할 때 사용한다 */
export interface SufficiencyThresholds {
  minObservationDays: number;
  minActiveUsers: number;
  minActiveDays: number;
  minVoiceSec: number;
  /** 이 값 미만이면 limited */
  limitedActiveUsers: number;
}

export interface DataSufficiency {
  level: SufficiencyLevel;
  /** 해당하는 모든 사유(등급과 무관하게 누적) */
  reasons: SufficiencyReason[];
  thresholds: SufficiencyThresholds;
  /** `collecting` 일 때 최소 관측일까지 남은 일수. 추적 개시일을 모르면 null, 그 외 사유뿐이면 0 */
  observationDaysRemaining: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ 중요 변화 탐지 시그널(F-GEMINI-036 — 리뷰 §5.3, D4 R4 하이브리드 · P2)
//
// P3(④ 구조화 — `keyChanges[].signalId` 의 동적 enum 원천)·P4(⑤ 액션 매핑 — 시그널 → `ReportActionKey`)가
// 이 타입을 그대로 소비한다. 키·종류는 **추가만** 한다(기존 값의 의미 변경·삭제 금지 — 저장된
// 구조화 리포트·액션 매핑이 키 문자열에 의존한다).
// 🔒 근거 수치는 길드 단위 집계값뿐이다 — 유저 ID·이름 필드가 타입상 존재하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

/** 시그널 종류 — 새 규칙은 종류를 추가해 확장한다 */
export type ReportSignalKind =
  /** 직전 기간 대비 급증(규칙 임계 또는 이력 z-score) */
  | 'surge'
  /** 직전 기간 대비 급감 */
  | 'drop'
  /** 최근 이력(≥4점) 중 최고치 */
  | 'new_high'
  /** 최근 이력(≥4점) 중 최저치 */
  | 'new_low'
  /** 기간 안 특정 일자의 급증(일별 중앙값 대비) */
  | 'spike_day'
  /** 기간 말미 연속 하락(일별) */
  | 'consecutive_decline'
  /** 점유율(편중도) 상승 */
  | 'concentration_up'
  /** 점유율(편중도) 하락 */
  | 'concentration_down'
  /** 직전 기간 활성 유저 재방문율이 낮음 */
  | 'retention_drop'
  /** 건강도 점수 밴드(70/40) 경계 통과 */
  | 'health_band_change';

/** 시그널 안정 식별자 `{지표}.{종류}` — 예: `activeUsers.drop`. P3 구조화 스키마의 enum 원천 */
export type ReportSignalKey = `${ReportMetricKey}.${ReportSignalKind}`;

/** 중요도 — 프롬프트 주입 순서·상한 선별에 쓴다 */
export type ReportSignalSeverity = 'info' | 'notable' | 'critical';

/** 판정 근거 — `rule`: R1 고정 임계값 · `zscore`: 길드 이력(≥4점) 기반 R2 판정 */
export type ReportSignalBasis = 'rule' | 'zscore';

export interface ReportSignalEvidence {
  /** 이번 값(일별 시그널은 그 날의 값) */
  current: number;
  /** 비교 기준값(직전 기간 값 / 연속 하락 시작일 값). 없으면 null */
  previous: number | null;
  deltaAbs: number | null;
  /** 증감률(%) — 지표의 % 억제 규칙(F-GEMINI-035)을 그대로 따른다 */
  deltaPct: number | null;
  /** 이력 기반 z-score(소수 1자리). 이력 < 4점이면 null */
  zScore: number | null;
  /** z-score·최고/최저 판정에 쓴 과거 회차 수(이번 회차 제외) */
  historyPoints: number;
  /** 일별 시그널의 기준일(YYYYMMDD). 기간 단위 시그널은 null */
  date: string | null;
  /**
   * 보조 기준값 — spike_day: 일별 중앙값 · consecutive_decline: 연속 하락 횟수 ·
   * retention_drop: 직전 기간 활성 유저 수(모집단) · newUserCount.surge: 이번 기간 활성 유저 수 · 그 외 null
   */
  reference: number | null;
}

export interface ReportSignal {
  key: ReportSignalKey;
  metricKey: ReportMetricKey;
  kind: ReportSignalKind;
  severity: ReportSignalSeverity;
  basis: ReportSignalBasis;
  evidence: ReportSignalEvidence;
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ 운영 액션(F-GEMINI-037 — 리뷰 §5.5, D10 (b) 딥링크 + admin-assist 프리필 · P4)
//
// 액션 후보는 `ReportSignal` 에 넣지 않는다 — 시그널 키로 닫힌 카탈로그(`constants/report-actions.ts`)를
// 매핑한다. 액션 키도 **추가만** 한다(의미 변경·삭제 금지 — 캐시된 응답·P3 구조화 스키마의
// `recommendedActions[].actionKey` 동적 enum 이 키 문자열에 의존한다).
// ─────────────────────────────────────────────────────────────────────────────

/** 운영 액션 키 `{대상 도메인}.{동작}` — 카탈로그(`REPORT_ACTION_CATALOG`)의 키 집합과 1:1 */
export type ReportActionKey =
  | 'inactive-member.review'
  | 'newbie.configure'
  | 'role-panel.configure'
  | 'auto-channel.configure'
  | 'voice-dashboard.review'
  | 'admin-assist.ask';

/** 액션이 연결되는 기존 도메인 기능(대시보드 탭 포함) */
export type ReportActionDomain =
  | 'inactive-member'
  | 'newbie'
  | 'role-panel'
  | 'auto-channel'
  | 'voice'
  | 'admin-assist';

/** 액션을 그릴 수 있는 표면 — `web`: AI 인사이트 패널 버튼 · `discord`: 주간 리포트 Embed 링크 버튼 */
export type ReportActionSurface = 'web' | 'discord';

/**
 * 액션 대상.
 * - `link`: 웹 딥링크. `pathTemplate` 의 `{guildId}` 를 치환한다(실재 App Router 경로만 — 웹 테스트가 고정).
 * - `admin-assist`: 관리 어시스턴트 패널 열기. 🧩 A11 확장 지점 — 패널 `open(prefill)` API 가 생기면
 *   웹 렌더러가 액션의 `signalKey` 로 프리필 문장을 만들어 넘긴다(카탈로그·응답 계약은 그대로).
 */
export type ReportActionTarget = { kind: 'link'; pathTemplate: string } | { kind: 'admin-assist' };

/**
 * 링크 대상이 요구하는 열람 권한. 현재 값은 전부 `guild-admin` — 리포트를 볼 수 있는 사람(길드 관리자)과
 * 같은 권한이라 액션이 권한을 넓히지 않는다(D10 — 원클릭 실행은 범위 밖). 🔒
 */
export type ReportActionAccess = 'guild-admin';

export interface ReportActionDefinition {
  key: ReportActionKey;
  domain: ReportActionDomain;
  /** 웹 `dashboard` 네임스페이스 i18n 키(디스코드 Embed 는 API 로컬 라벨 테이블 — 같은 키 집합) */
  labelKey: string;
  target: ReportActionTarget;
  surfaces: readonly ReportActionSurface[];
  requiredAccess: ReportActionAccess;
  /**
   * Pro 전용 기능으로 가는 액션이면 그 기능 키 — 렌더러가 entitlement 를 보고 잠금 배지를 붙인다
   * (premium-policy §6.1: 관리 화면 열람권은 판매 불가 → 현재 카탈로그는 전부 무료 화면이라 null).
   */
  premiumFeature: PremiumFeatureKey | null;
}

/** `ai-insight` 응답·주간 Embed 가 싣는 액션 1건 — 경로는 싣지 않는다(렌더러가 카탈로그로 해석) */
export interface ReportActionItem {
  key: ReportActionKey;
  /** 이 액션을 낳은 시그널(중요도가 가장 높은 것). A11 프리필 문장의 입력이 된다 */
  signalKey: ReportSignalKey;
  severity: ReportSignalSeverity;
}

// ─────────────────────────────────────────────────────────────────────────────
// ④ 구조화 리포트 (F-GEMINI-038) — ai-insight v2 응답 구조체
// ─────────────────────────────────────────────────────────────────────────────

/** 원인 가설의 신뢰도 — `high` 는 허용하지 않는다(가설은 단정하지 않음) */
export type StructuredReportConfidence = 'low' | 'medium';

/** v2 리포트의 데이터 충분도 — `insufficient` 는 LLM 을 부르지 않으므로 report 자체가 없다 */
export type StructuredReportSufficiency = Exclude<SufficiencyLevel, 'insufficient'>;

/** 핵심 변화 1건 — 입력 시그널 하나를 서술한다 */
export interface StructuredReportKeyChange {
  signalId: ReportSignalKey;
  /** 숫자 placeholder 치환·검증 완료된 서술 */
  narrative: string;
}

/** 원인 가설 1건 — `limited` 등급에서는 항상 비어 있다 */
export interface StructuredReportHypothesis {
  signalId: ReportSignalKey;
  text: string;
  confidence: StructuredReportConfidence;
}

/** 권장 액션 1건 — 액션 카탈로그 키 + 그 액션을 권하는 근거 문장 */
export interface StructuredReportRecommendedAction {
  actionKey: ReportActionKey;
  rationale: string;
}

/**
 * ai-insight v2 구조화 리포트. LLM 출력을 서버가 검증·치환한 값이다.
 * `schemaVersion`·`sufficiency` 는 서버가 부여한다. 유저명 필드는 없다 🔒.
 *
 * 배열 상한: sufficient 3·3·3 / limited 1·0·1. 빈 배열은 정상("큰 변화 없음" 결론).
 */
export interface StructuredReportV2 {
  schemaVersion: 2;
  sufficiency: StructuredReportSufficiency;
  /** 2~3문장, 숫자 placeholder 치환 완료 */
  summary: string;
  keyChanges: StructuredReportKeyChange[];
  hypotheses: StructuredReportHypothesis[];
  recommendedActions: StructuredReportRecommendedAction[];
}
