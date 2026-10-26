import { LEVEL_ANNOUNCE_STRINGS } from '../constants/level-announce-defaults';
import { LEVEL_ANNOUNCE_TEMPLATE_VARIABLES } from '../constants/level-defaults';
import type { SupportedLocale } from '../constants/locale';
import type { LevelAnnounceLineVars } from '../types/level';

/** 멘션 무력화에 삽입하는 zero-width space */
const ZWSP = '\u200B';

/** `{식별자}` 형태 — 숫자 시작·공백 포함·한글 변수는 리터럴(S7) */
const IDENTIFIER_PLACEHOLDER_PATTERN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** 화이트리스트 4변수만 치환 대상 */
const WHITELIST_PLACEHOLDER_PATTERN = new RegExp(
  `\\{(${LEVEL_ANNOUNCE_TEMPLATE_VARIABLES.join('|')})\\}`,
  'g',
);

/** 줄바꿈류: CR · LF · LS(U+2028) · PS(U+2029) */
const LINE_BREAK_PATTERN = /[\r\n\u2028\u2029]/;

const EVERYONE_HERE_PATTERN = /@(?!\u200B)(everyone|here)/gi;
const USER_ROLE_MENTION_PATTERN = /<@(?!\u200B)/g;
const CHANNEL_MENTION_PATTERN = /<#(?!\u200B)/g;

/** 화이트리스트 밖 `{식별자}` 를 등장 순서·중복 제거로 반환(대소문자 구분 — `{User}` 포함). */
export function findUnknownLevelAnnounceVariables(template: string): string[] {
  const allowed: readonly string[] = LEVEL_ANNOUNCE_TEMPLATE_VARIABLES;
  const unknown = new Set<string>();
  for (const match of template.matchAll(IDENTIFIER_PLACEHOLDER_PATTERN)) {
    if (!allowed.includes(match[1])) {
      unknown.add(match[1]);
    }
  }
  return [...unknown];
}

/** 줄바꿈류 문자 포함 여부(T4 — 1인 1줄). */
export function hasLevelAnnounceLineBreak(template: string): boolean {
  return LINE_BREAK_PATTERN.test(template);
}

/** 코드포인트 기준 길이 — 서버 `@MaxLength`·PG `varchar` 와 일치(P12). */
export function countLevelAnnounceTemplateLength(template: string): number {
  return [...template].length;
}

/**
 * 저장 전 정규화 — `undefined` 는 유지(S11 생략 = 기존값 유지), `null`/빈 문자열/공백뿐이면 `null`
 * (기본 템플릿 복귀), 그 외는 원문 그대로(trim 하지 않음).
 */
export function normalizeLevelAnnounceTemplate(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value.trim() === '') {
    return null;
  }
  return value;
}

/** `@everyone`·`@here` 만 무력화한다(S13 최종 방어선 — 주입된 `<@id>` 는 보존). */
function neutralizeEveryoneHere(text: string): string {
  return text.replace(EVERYONE_HERE_PATTERN, (_match, word: string) => `@${ZWSP}${word}`);
}

/**
 * 관리자 입력 원문의 멘션을 무력화한다 — `@everyone`/`@here`, `<@…>`(`<@!`·`<@&` 포함), `<#…>`.
 * zero-width space 삽입이며 멱등이다(이미 무력화된 문자열에 재적용해도 변화 없음).
 */
export function neutralizeDiscordMentions(text: string): string {
  return neutralizeEveryoneHere(text)
    .replace(USER_ROLE_MENTION_PATTERN, `<@${ZWSP}`)
    .replace(CHANNEL_MENTION_PATTERN, `<#${ZWSP}`);
}

/**
 * 템플릿 1줄 렌더 (S13).
 * 템플릿을 리터럴 조각/화이트리스트 변수로 분해 → 리터럴 조각만 멘션 무력화 → 변수 값 결합
 * (주입 멘션 `<@id>`/`<@&id>` 는 무력화하지 않음) → 최종 문자열에 `@everyone`/`@here` 1회 더 무력화.
 * 화이트리스트 밖 `{식별자}` 는 리터럴로 남기고 예외를 던지지 않는다(P5). 값 안의 `{x}`·`$&` 는 재해석하지 않는다.
 */
export function renderLevelAnnounceLine(template: string, vars: LevelAnnounceLineVars): string {
  const values: Record<string, string> = {
    user: vars.user,
    level: String(vars.level),
    xp: String(vars.xp),
    role: vars.role,
  };
  let result = '';
  let cursor = 0;
  for (const match of template.matchAll(WHITELIST_PLACEHOLDER_PATTERN)) {
    const start = match.index ?? 0;
    result += neutralizeDiscordMentions(template.slice(cursor, start)) + values[match[1]];
    cursor = start + match[0].length;
  }
  result += neutralizeDiscordMentions(template.slice(cursor));
  return neutralizeEveryoneHere(result);
}

/** 저장 템플릿이 있으면 그대로, 없으면 길드 언어 기본 템플릿(역할 유/무 2변형). */
export function resolveLevelAnnounceTemplate(
  custom: string | null,
  locale: SupportedLocale,
  hasRole: boolean,
): string {
  if (custom !== null) {
    return custom;
  }
  const table = LEVEL_ANNOUNCE_STRINGS[locale];
  return hasRole ? table.defaultLineWithRole : table.defaultLine;
}
