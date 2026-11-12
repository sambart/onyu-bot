/**
 * 사용자 전역 개인 설정 계약 — U8-B2 (F-SUB-034~036) + U8-B3 (표시 혜택). `GET/PATCH /api/users/me/preferences`.
 * 해금 여부(저장값 ∩ 해금)는 응답에 싣지 않는다 — 해금 단일 출처는 entitlement 스냅샷이다.
 * 단 `plusBadgeGrade` 는 해금 플래그가 아니라 서버가 파생해 내려주는 읽기 전용 표시값이다(요청으로 보낼 수 없다).
 */
import { isOneOf } from '../helpers/is-one-of';
import type { AiPersonaKey } from './ai-persona';
import type { MeCardThemeKey } from './card-theme';

/** Plus 칭호 키 — 닫힌 enum. 표시 순서 = 배열 순서(런타임 정렬 로직 금지). 라벨은 `PLUS_TITLE_LABEL`. */
export const PLUS_TITLE_KEYS = [
  'stargazer',
  'lighthouse',
  'navigator',
  'wanderer',
  'maestro',
  'ember',
  'spotlight',
  'pathfinder',
] as const;

export type PlusTitleKey = (typeof PLUS_TITLE_KEYS)[number];

/** 저장값·요청값 검증용 타입 가드. */
export function isPlusTitleKey(value: unknown): value is PlusTitleKey {
  return typeof value === 'string' && isOneOf(PLUS_TITLE_KEYS, value);
}

/** Plus 배지 등급 1~4 (구간은 `PLUS_BADGE_GRADE_MIN_MONTHS`, 라벨은 `PLUS_BADGE_GRADE_LABEL`). */
export type PlusBadgeGrade = 1 | 2 | 3 | 4;

/** 렌더 적용값(저장 ∩ 해금 ∩ 카탈로그). HTTP 응답 계약 아님 — API 내부 렌더 입력. */
export interface AppliedDisplayPerks {
  badgeGrade: PlusBadgeGrade | null;
  titleKey: PlusTitleKey | null;
}

/** 표시 혜택 없음 — 비해금·실패 격리 시 렌더 입력 기본값. */
export const NO_DISPLAY_PERKS: Readonly<AppliedDisplayPerks> = Object.freeze({
  badgeGrade: null,
  titleKey: null,
});

/** 저장된 개인 설정. 행이 없으면 기본값 + `updatedAt: null` (행은 생성하지 않는다). */
export interface UserPreferenceResponse {
  cardTheme: MeCardThemeKey;
  aiPersona: AiPersonaKey;
  /** 카드에 Plus 배지를 표시할지(저장값, 기본 false). */
  showPlusBadge: boolean;
  /** 선택한 칭호(저장값). null = 미선택. */
  titleKey: PlusTitleKey | null;
  /** 읽기 전용 서버 파생값 — 현재 Plus 연속 구독 기준 등급. 산정 불가·해당 없음이면 null. */
  plusBadgeGrade: PlusBadgeGrade | null;
  /** U8-B4 — 개인 AI 월간 리포트 자동 생성 수신 여부(저장값, 기본 `DEFAULT_MONTHLY_REPORT_ENABLED`). */
  monthlyReportEnabled: boolean;
  /** ISO 8601. 저장 이력이 없으면 null. */
  updatedAt: string | null;
}

/** 부분 갱신 본문 — 최소 1필드 필수(빈 본문은 400). `titleKey: null` 만 해제 의미로 허용한다. */
export interface UpdateUserPreferenceRequest {
  cardTheme?: MeCardThemeKey;
  aiPersona?: AiPersonaKey;
  showPlusBadge?: boolean;
  /** null = 해제. */
  titleKey?: PlusTitleKey | null;
  monthlyReportEnabled?: boolean;
}

/** 월간 리포트 자동 생성 수신 기본값(행이 없을 때·신규 행). */
export const DEFAULT_MONTHLY_REPORT_ENABLED = true;
