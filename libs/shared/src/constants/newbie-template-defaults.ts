import type { SupportedLocale } from './locale';

/**
 * 신입사용자(newbie) 미션/새싹 임베드 템플릿 기본값 + 허용 변수 단일 정본.
 * 원본은 `apps/api/src/newbie/infrastructure/newbie-template.constants.ts` (108줄) —
 * 값은 그대로 옮긴 것이며 신설은 값 변경이 아니다. api 원본 파일은 재수출(re-export) shim 으로
 * 전환될 예정이라(S2a) 기존 import 경로는 그대로 유지된다.
 *
 * 허용변수(`*_ALLOWED_VARS`)를 기본 템플릿 문자열과 함께 이 파일에 두는 이유(DR-1/DR-2 재발 방지):
 * 기본 템플릿이 자신의 허용변수 목록을 모른 채 다른 계층에 따로 존재하면, 허용변수가 바뀌어도
 * 기본 템플릿이 갱신되지 않는 드리프트가 재발한다. 두 값을 한 파일에 두면 "기본 템플릿은
 * 자기 허용변수만 사용한다" 라는 드리프트 가드 테스트를 이 파일 하나로 작성할 수 있다.
 *
 * i18n G2(길드 로케일 분기): `NEWBIE_TEMPLATE_DEFAULTS`(Record<SupportedLocale, …>)가 신설
 * 정본이고, 아래 `DEFAULT_*` named export 전부는 `.ko` 별칭(참조 동일)으로 하위호환을 보존한다.
 * `en` 값은 `libs/i18n/locales/en/web/settings.json` 의 `newbie.template.*` 키가 정본이며
 * (드리프트 가드: `apps/web/app/lib/__tests__/newbie-api.test.ts`), 이 파일은 그 사본이다.
 */

// ---- 신입 미션 상태 매핑 셰이프 ----

/**
 * 신입 미션 상태 표시 매핑 항목 셰이프 — `apps/api/src/newbie/domain/newbie-mission.types.ts` 의
 * `StatusMappingEntry` 와 구조적으로 동일하다. `libs/shared` 는 api 도메인 타입에 의존하지 않으므로
 * (P3) import 하지 않고 여기서 독립적으로 정의한다.
 */
interface NewbieStatusMappingEntry {
  emoji: string;
  text: string;
}

/** `apps/api/src/newbie/domain/newbie-mission.types.ts` 의 `StatusMapping` 과 구조적으로 동일. */
interface NewbieStatusMapping {
  IN_PROGRESS: NewbieStatusMappingEntry;
  COMPLETED: NewbieStatusMappingEntry;
  FAILED: NewbieStatusMappingEntry;
  LEFT: NewbieStatusMappingEntry;
}

/** 로케일별 신입 미션/새싹 임베드 기본 템플릿 셰이프. */
interface NewbieTemplateDefaults {
  missionTitle: string;
  missionHeader: string;
  missionItem: string;
  missionFooter: string;
  statusMapping: NewbieStatusMapping;
  mocoTitle: string;
  mocoBody: string;
  mocoItem: string;
  mocoFooter: string;
  mocoFooterNoInterval: string;
  mocoScoring: string;
}

/**
 * 길드 로케일별 신입 미션/새싹 임베드 기본 템플릿 정본(i18n G2).
 * `ko` 는 기존 상수와 바이트 단위 동일 — 값 변경이 아니다.
 * `en` 은 `libs/i18n/locales/en/web/settings.json` `newbie.template.*` 값을 그대로 옮긴 것이다.
 */
export const NEWBIE_TEMPLATE_DEFAULTS: Record<SupportedLocale, NewbieTemplateDefaults> = {
  ko: {
    missionTitle: '🧑‍🌾 신입 미션 체크',
    missionHeader: '🧑‍🌾 뉴비 멤버 (총 인원: {totalCount}명)',
    missionItem:
      '{mention} 🌱\n{startDate} ~ {endDate}\n{statusEmoji} {statusText} | 플레이타임: {playtime} | 플레이횟수: {playCount}회',
    missionFooter: '마지막 갱신: {updatedAt}',
    statusMapping: {
      IN_PROGRESS: { emoji: '🟡', text: '진행중' },
      COMPLETED: { emoji: '✅', text: '완료' },
      FAILED: { emoji: '❌', text: '실패' },
      LEFT: { emoji: '🚪', text: '퇴장' },
    },
    mocoTitle: '🏆 새싹 사냥 순위',
    mocoBody:
      '**TOP {rank} — {hunterName} 🌱**\n**🏆 {score}점**\n⏱️ {totalMinutes}분 · 🎮 {sessionCount}회 · 🌱 {uniqueNewbieCount}명\n\n{mocoList}',
    mocoItem: '🌱 **{newbieName}** — {minutes}분 ({sessions}회)',
    mocoFooter: '페이지 {currentPage}/{totalPages} | 자동 갱신 {interval}분',
    mocoFooterNoInterval: '페이지 {currentPage}/{totalPages}',
    mocoScoring:
      '── 점수 산정 ──\n🎮 {scorePerSession}점/회 · ⏱️ {scorePerMinute}점/분 · 🌱 {scorePerUnique}점/명\n⏳ 최소 {minCoPresence}분 동시접속',
  },
  en: {
    missionTitle: '🧑‍🌾 New Member Mission Check',
    missionHeader: '🧑‍🌾 New Members (Total: {totalCount})',
    missionItem:
      '{mention} 🌱\n{startDate} ~ {endDate}\n{statusEmoji} {statusText} | Playtime: {playtime} | Play Count: {playCount}',
    missionFooter: 'Last updated: {updatedAt}',
    statusMapping: {
      IN_PROGRESS: { emoji: '🟡', text: 'In Progress' },
      COMPLETED: { emoji: '✅', text: 'Completed' },
      FAILED: { emoji: '❌', text: 'Failed' },
      LEFT: { emoji: '🚪', text: 'Left' },
    },
    mocoTitle: '🏆 Sprout Hunt Rankings',
    mocoBody:
      '**TOP {rank} — {hunterName} 🌱**\n**🏆 {score} pts**\n⏱️ {totalMinutes}m · 🎮 {sessionCount} sessions · 🌱 {uniqueNewbieCount} newbies\n\n{mocoList}',
    mocoItem: '🌱 **{newbieName}** — {minutes}m ({sessions} sessions)',
    mocoFooter: 'Page {currentPage}/{totalPages} | Auto-refresh every {interval}m',
    mocoFooterNoInterval: 'Page {currentPage}/{totalPages}',
    mocoScoring:
      '── Scoring ──\n🎮 {scorePerSession} pts/session · ⏱️ {scorePerMinute} pts/min · 🌱 {scorePerUnique} pts/unique\n⏳ Min {minCoPresence}m co-presence',
  },
};

// ---- 하위호환 별칭 — 기존 소비처(shim·controller·web·spec)의 import 경로와 참조 동일성을 보존한다 ----

// ---- 미션 템플릿 기본값 ----

export const DEFAULT_MISSION_TITLE_TEMPLATE = NEWBIE_TEMPLATE_DEFAULTS.ko.missionTitle;

export const DEFAULT_MISSION_HEADER_TEMPLATE = NEWBIE_TEMPLATE_DEFAULTS.ko.missionHeader;

export const DEFAULT_MISSION_ITEM_TEMPLATE = NEWBIE_TEMPLATE_DEFAULTS.ko.missionItem;

export const DEFAULT_MISSION_FOOTER_TEMPLATE = NEWBIE_TEMPLATE_DEFAULTS.ko.missionFooter;

export const DEFAULT_STATUS_MAPPING: NewbieStatusMapping =
  NEWBIE_TEMPLATE_DEFAULTS.ko.statusMapping;

// ---- 미션 템플릿 허용 변수 ----

export const MISSION_TITLE_ALLOWED_VARS = ['{totalCount}'] as const;

export const MISSION_HEADER_ALLOWED_VARS = [
  '{totalCount}',
  '{inProgressCount}',
  '{completedCount}',
  '{failedCount}',
  '{leftCount}',
] as const;

export const MISSION_ITEM_ALLOWED_VARS = [
  '{username}',
  '{mention}',
  '{startDate}',
  '{endDate}',
  '{statusEmoji}',
  '{statusText}',
  '{playtimeHour}',
  '{playtimeMin}',
  '{playtimeSec}',
  '{playtime}',
  '{playCount}',
  '{targetPlaytime}',
  '{targetPlayCount}',
  '{daysLeft}',
] as const;

export const MISSION_FOOTER_ALLOWED_VARS = ['{updatedAt}'] as const;

// ---- 새싹 템플릿 기본값 ----

// A6: Embed 모드 10명/페이지 — titleTemplate은 페이지 단위(1회), bodyTemplate은 사냥꾼 1명당 반복.
export const DEFAULT_MOCO_TITLE_TEMPLATE = NEWBIE_TEMPLATE_DEFAULTS.ko.mocoTitle;

export const DEFAULT_MOCO_BODY_TEMPLATE = NEWBIE_TEMPLATE_DEFAULTS.ko.mocoBody;

export const DEFAULT_MOCO_ITEM_TEMPLATE = NEWBIE_TEMPLATE_DEFAULTS.ko.mocoItem;

export const DEFAULT_MOCO_FOOTER_TEMPLATE = NEWBIE_TEMPLATE_DEFAULTS.ko.mocoFooter;

export const DEFAULT_MOCO_FOOTER_TEMPLATE_NO_INTERVAL =
  NEWBIE_TEMPLATE_DEFAULTS.ko.mocoFooterNoInterval;

// ---- 새싹 템플릿 허용 변수 ----

// titleTemplate은 페이지 단위 1회 렌더 — {rank}/{hunterName}은 더 이상 title에서 사용 불가(bodyTemplate로 이동, A6)
export const MOCO_TITLE_ALLOWED_VARS = ['{currentPage}', '{totalPages}'] as const;

// bodyTemplate은 사냥꾼 1명당 반복 렌더 — {rank}/{hunterName} 신규 편입(A6)
export const MOCO_BODY_ALLOWED_VARS = [
  '{rank}',
  '{hunterName}',
  '{totalMinutes}',
  '{mocoList}',
  '{score}',
  '{sessionCount}',
  '{uniqueNewbieCount}',
] as const;

export const MOCO_ITEM_ALLOWED_VARS = [
  '{newbieName}',
  '{newbieMention}',
  '{minutes}',
  '{sessions}',
] as const;

export const MOCO_FOOTER_ALLOWED_VARS = [
  '{currentPage}',
  '{totalPages}',
  '{interval}',
  '{periodStart}',
  '{periodEnd}',
] as const;

// ---- 새싹 점수 산정 템플릿 ----

export const DEFAULT_MOCO_SCORING_TEMPLATE = NEWBIE_TEMPLATE_DEFAULTS.ko.mocoScoring;

export const MOCO_SCORING_ALLOWED_VARS = [
  '{scorePerSession}',
  '{scorePerMinute}',
  '{scorePerUnique}',
  '{minCoPresence}',
] as const;
