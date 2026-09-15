import type { MessageCode } from '../constants/message-codes';
import { MESSAGE_CODE } from '../constants/message-codes';

/**
 * 자동방(auto-channel) 채널명 조립 순수 로직 — `apps/api`(실제 생성)와 `apps/web`(미리보기)가
 * 공유하는 단일 정본이다.
 *
 * 원본은 `apps/api/src/channel/auto/application/auto-channel.service.ts` 의
 * `buildChannelName` / `buildInstantChannelName` 내부 순수 부분이며, web 이 이를 손으로
 * 복제하다 드리프트(치환 non-global, 기본형 문구 불일치 등)를 낸 사고를 계기로 이곳에 추출했다
 * (docs/plans/auto-channel-structure-preview.md §2).
 *
 * 이 모듈은 i18n 을 알지 않는다 — 로케일 기본형 문자열은 호출자가 이미 해석해 인자로 넘긴다.
 * `{n}` 넘버링(`resolveChannelName`)은 Discord 채널 목록 조회에 의존하는 I/O 로직이라
 * 공유 대상이 아니다.
 *
 * 방제 자유 입력(`{input}` 토큰, F-VOICE-125~133, docs/plans/auto-channel-name-input.md §3-2)의
 * 검증·치환 순수 함수도 이곳에 추가한다 — api(실검증) · N3(계산) · web(미리보기/사전검증)이
 * 같은 함수를 공유한다(D-5).
 */

/** 방제 자유 입력 토큰 (7자, UTF-16 기준) */
export const AUTO_CHANNEL_INPUT_TOKEN = '{input}';
/** Discord 채널명 상한 (F-VOICE-089) — 세는 단위는 JS .length (D-8) */
export const AUTO_CHANNEL_NAME_MAX_LENGTH = 100;
/** F-VOICE-128 기본 minLength */
export const AUTO_CHANNEL_NAME_INPUT_MIN_DEFAULT = 1;
/** 저장 API 안전판 (D-4) */
export const AUTO_CHANNEL_FORBIDDEN_WORDS_MAX_COUNT = 50;
export const AUTO_CHANNEL_FORBIDDEN_WORD_MAX_LENGTH = 50;

export type AutoChannelNameInputMode = 'off' | 'optional' | 'required';

export interface AutoChannelNameInputRule {
  minLength?: number;
  maxLength?: number;
  forbiddenWords?: string[];
}

/** 확정방(select 모드) 채널명 조립 입력. 템플릿 미설정은 null 또는 ''로 전달한다. */
export interface AutoChannelNameParts {
  /** 버튼의 channelNameTemplate. 미설정 시 null/'' */
  buttonTemplate: string | null | undefined;
  /** 버튼 템플릿 미설정 시 적용할 로케일 기본형 — {label} 치환이 끝난 문자열 */
  defaultButtonTemplate: string;
  /** 하위 선택지 channelNameTemplate. 없으면 undefined/null/'' */
  subOptionTemplate?: string | null;
  /** {username} 에 넣을 값 (실제=서버 닉네임 / 미리보기=예시 인물명) */
  userName: string;
  /** 신규 — 방제 자유 입력 원문(trim 완료). 미전달/undefined 면 {input} 치환을 하지 않는다(현행 동작 보존) */
  userInput?: string | null;
}

/**
 * F-VOICE-011 확정방 채널명 조립 (넘버링 이전 단계).
 *
 * subOptionTemplate 이 truthy 면 `{name}`(버튼 기본 이름) + `{username}` 치환 결과를 반환하고,
 * 아니면 버튼 기본 이름을 그대로 반환한다. `userInput` 이 null/undefined 가 아니면 마지막
 * 단계에서 `{input}` 을 치환한다(치환 순서 = {username} → {name} → {input}, 토큰 주입 방어).
 */
export function buildAutoChannelBaseName(parts: AutoChannelNameParts): string {
  // '' 도 "미설정"으로 취급해야 하므로 ?? 가 아닌 빈 문자열 분기를 쓴다
  const rawButtonTemplate = parts.buttonTemplate ?? '';
  const buttonTemplate = rawButtonTemplate === '' ? parts.defaultButtonTemplate : rawButtonTemplate;
  const baseName = buttonTemplate.replace(/{username}/g, parts.userName);

  const result = parts.subOptionTemplate
    ? parts.subOptionTemplate.replace(/{name}/g, baseName).replace(/{username}/g, parts.userName)
    : baseName;

  if (parts.userInput === undefined || parts.userInput === null) {
    return result;
  }

  const withInput = applyAutoChannelInputToken(result, parts.userInput);

  // `{input}` 단독 템플릿(예: '{input}') + optional 모드 빈 제출은 토큰 치환 결과가 통째로
  // 빈 문자열이 된다(applyAutoChannelInputToken 의 인접 공백 제거 로직 참조) — 빈 채널명으로
  // 그대로 생성/미리보기 되는 것을 막고 로케일 기본형으로 폴백한다(2026-09-15 리뷰 수리).
  if (withInput.trim() === '') {
    return parts.defaultButtonTemplate.replace(/{username}/g, parts.userName);
  }

  return withInput;
}

/**
 * F-VOICE-020 즉시 생성 채널명 조립. template 미설정 시 defaultTemplate 사용.
 */
export function buildInstantChannelBaseName(
  template: string | null | undefined,
  defaultTemplate: string,
  userName: string,
): string {
  // '' 도 "미설정"으로 취급해야 하므로 ?? 가 아닌 빈 문자열 분기를 쓴다
  const rawTemplate = template ?? '';
  return (rawTemplate === '' ? defaultTemplate : rawTemplate).replace(/{username}/g, userName);
}

/** 템플릿에 {n} 이 포함되는지 (미리보기 보조 텍스트 판단용). */
export function hasAutoNumberToken(template: string): boolean {
  return template.includes('{n}');
}

// ─────────────────────────────────────────────────────────────────────────
// 방제 자유 입력 (F-VOICE-125~133, docs/plans/auto-channel-name-input.md §3-2)
// ─────────────────────────────────────────────────────────────────────────

/** 템플릿 안의 {input} 등장 횟수 (R6·EC-ACNI-11 판정 기반) */
export function countAutoChannelInputTokens(template: string | null | undefined): number {
  if (!template) return 0;
  return template.split(AUTO_CHANNEL_INPUT_TOKEN).length - 1;
}

/** count > 0 — R3(instant 금지) 판정용 */
export function hasAutoChannelInputToken(template: string | null | undefined): boolean {
  return countAutoChannelInputTokens(template) > 0;
}

/** count === 1 — R1·R2·R6 판정용 (웹 사전 검증도 이 함수를 쓴다) */
export function hasExactlyOneAutoChannelInputToken(template: string | null | undefined): boolean {
  return countAutoChannelInputTokens(template) === 1;
}

/**
 * 최종 적용 템플릿 해석 — 하위 선택지 템플릿 우선(F-VOICE-010), 없으면 버튼 템플릿,
 * 버튼 템플릿도 미설정('' 포함)이면 로케일 기본형. `{username}`/`{name}` 은 치환하지 않는다
 * (호출자는 `{input}` 존재 여부·위치만 필요로 한다 — N3 미리보기/저장 시점 검증 공용).
 */
export function resolveAutoChannelFinalTemplate(parts: {
  buttonTemplate: string | null | undefined;
  defaultButtonTemplate: string;
  subOptionTemplate?: string | null;
}): string {
  if (parts.subOptionTemplate) {
    return parts.subOptionTemplate;
  }
  const rawButtonTemplate = parts.buttonTemplate ?? '';
  return rawButtonTemplate === '' ? parts.defaultButtonTemplate : rawButtonTemplate;
}

/**
 * F-VOICE-128 maxLength 계산 (EP §12-2b-4). 단위는 JS .length (D-8).
 *   고정부 = template.length − (토큰 1회 등장 시 7, 0회면 0)
 *   계산상한 = 100 − 고정부
 *   결과 = min(계산상한, rule.maxLength ?? 계산상한)
 * 🔒 모순 사양(min > max)을 여기서 보정하지 않는다 — 저장 시점 R5 가 차단한다.
 * 🔒 토큰 2회 이상 템플릿은 R6 가 저장 시점에 막으므로 이 함수의 전제(1회)가 성립한다.
 */
export function calcAutoChannelInputMaxLength(
  template: string,
  rule?: AutoChannelNameInputRule | null,
): number {
  const hasSingleToken = countAutoChannelInputTokens(template) === 1;
  const fixedLength = template.length - (hasSingleToken ? AUTO_CHANNEL_INPUT_TOKEN.length : 0);
  const computedMax = AUTO_CHANNEL_NAME_MAX_LENGTH - fixedLength;
  return Math.min(computedMax, rule?.maxLength ?? computedMax);
}

/** rule.minLength ?? 1 (보정 없음) */
export function calcAutoChannelInputMinLength(rule?: AutoChannelNameInputRule | null): number {
  return rule?.minLength ?? AUTO_CHANNEL_NAME_INPUT_MIN_DEFAULT;
}

export type AutoChannelNameValidationResult =
  | { ok: true; value: string } // trim 된 입력 (optional + 빈 입력이면 '')
  | { ok: false; code: MessageCode; params?: Record<string, string | number> };

/**
 * F-VOICE-128 양식 검증. 전처리는 trim() 만 한다(제어문자·마크다운 스트립 없음 — 채택).
 * 판정 순서 = 첫 실패에서 중단 (길이는 전부 .length):
 *   ① required + trim 후 '' → ERR_AUTO_CHANNEL_NAME_REQUIRED (params 없음)
 *   ② minLength 미만(빈 문자열 제외) → ERR_AUTO_CHANNEL_NAME_TOO_SHORT { minLength }
 *   ③ maxLength 초과 → ERR_AUTO_CHANNEL_NAME_TOO_LONG { maxLength }
 *   ④ forbiddenWords 부분 일치(대소문자 무시, 정규식 아님) → ERR_AUTO_CHANNEL_NAME_FORBIDDEN_WORD { word }
 * mode='off' 는 항상 { ok: true, value: '' } (낡은 안내 메시지 방어 — §5-5 A-7)
 */
export function validateAutoChannelNameInput(input: {
  userInput: string;
  mode: AutoChannelNameInputMode;
  template: string;
  rule?: AutoChannelNameInputRule | null;
}): AutoChannelNameValidationResult {
  if (input.mode === 'off') {
    return { ok: true, value: '' };
  }

  const trimmed = input.userInput.trim();

  if (input.mode === 'required' && trimmed === '') {
    return { ok: false, code: MESSAGE_CODE.ERR_AUTO_CHANNEL_NAME_REQUIRED };
  }

  const minLength = calcAutoChannelInputMinLength(input.rule);
  if (trimmed !== '' && trimmed.length < minLength) {
    return { ok: false, code: MESSAGE_CODE.ERR_AUTO_CHANNEL_NAME_TOO_SHORT, params: { minLength } };
  }

  const maxLength = calcAutoChannelInputMaxLength(input.template, input.rule);
  if (trimmed.length > maxLength) {
    return { ok: false, code: MESSAGE_CODE.ERR_AUTO_CHANNEL_NAME_TOO_LONG, params: { maxLength } };
  }

  // 공백만 있는 원소는 무엇을 넣어도 걸러지는 죽은 규칙이라 판정에서 제외한다 — DTO 저장
  // 시점에서 이미 막지만(auto-channel-save.dto.ts), 과거 잔존 데이터/직접 조작 방어(2026-09-15 리뷰 수리).
  const forbiddenWord = (input.rule?.forbiddenWords ?? [])
    .filter((word) => word.trim() !== '')
    .find((word) => trimmed.toLowerCase().includes(word.toLowerCase()));
  if (forbiddenWord !== undefined) {
    return {
      ok: false,
      code: MESSAGE_CODE.ERR_AUTO_CHANNEL_NAME_FORBIDDEN_WORD,
      params: { word: forbiddenWord },
    };
  }

  return { ok: true, value: trimmed };
}

/**
 * {input} 치환. value 가 빈 문자열이면 토큰 + 토큰이 유일하게 차지하던 인접 공백 1개를
 * 함께 제거한다(F-VOICE-128 — `[옵] {input}` → `[옵]`, `{input} 채널` → `채널`).
 * 토큰이 정확히 1회 등장한다는 전제(R6 가 저장 시점에 보장) 하에 첫 등장만 처리한다.
 */
export function applyAutoChannelInputToken(template: string, value: string): string {
  const tokenIndex = template.indexOf(AUTO_CHANNEL_INPUT_TOKEN);
  if (tokenIndex === -1) {
    return template;
  }

  if (value !== '') {
    return (
      template.slice(0, tokenIndex) +
      value +
      template.slice(tokenIndex + AUTO_CHANNEL_INPUT_TOKEN.length)
    );
  }

  const tokenEnd = tokenIndex + AUTO_CHANNEL_INPUT_TOKEN.length;
  const charBefore = template[tokenIndex - 1];
  const charAfter = template[tokenEnd];

  if (charBefore === ' ') {
    return template.slice(0, tokenIndex - 1) + template.slice(tokenEnd);
  }
  if (charAfter === ' ') {
    return template.slice(0, tokenIndex) + template.slice(tokenEnd + 1);
  }
  return template.slice(0, tokenIndex) + template.slice(tokenEnd);
}
