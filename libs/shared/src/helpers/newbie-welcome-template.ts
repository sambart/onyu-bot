import {
  WELCOME_MISSION_VAR_NAMES,
  WELCOME_TEMPLATE_ALLOWED_VARS,
} from '../constants/newbie-template-defaults';
import { truncateByCodePoint } from './truncate';

type WelcomeMissionVarName = (typeof WELCOME_MISSION_VAR_NAMES)[number];

/**
 * 미션 변수 조립 입력 — `NewbieConfigDto` 중 필요한 필드만 구조적으로 재선언한다.
 * `libs/shared` 가 `@onyu/bot-api-client` 에 의존하지 않기 위함.
 */
export interface WelcomeMissionVarsInput {
  missionEnabled: boolean;
  missionTargetPlaytimeHours?: number | null;
  missionTargetPlayCount?: number | null;
  missionDurationDays?: number | null;
  missionNotifyChannelId?: string | null;
}

/** `{...}` 형태 토큰 — API `newbie-template-validator.util.ts` 와 동일 규칙. */
const WELCOME_VAR_TOKEN_PATTERN = /\{[^}]+\}/g;

/** @everyone / @here 대량 멘션 탐지. */
const WELCOME_MASS_MENTION_PATTERN = /@(everyone|here)/i;

/** 대량 멘션 개별 토큰(소문자) — 신규 도입 판정용. */
const WELCOME_MASS_MENTION_TOKENS: readonly string[] = ['@everyone', '@here'];

/**
 * 미션 설정으로 환영 템플릿 변수 4개를 구성한다.
 *
 * 값은 단위 없는 순수 숫자/멘션만 반환한다 — 봇은 길드 로케일을 모르므로 단위 문구는
 * 기본 템플릿 문장 쪽에 고정 텍스트로 둔다.
 */
export function buildWelcomeMissionVars(
  input: WelcomeMissionVarsInput,
): Record<WelcomeMissionVarName, string> {
  const isEnabled = input.missionEnabled;

  return {
    missionTargetPlaytime:
      isEnabled && input.missionTargetPlaytimeHours != null
        ? String(input.missionTargetPlaytimeHours)
        : '',
    missionTargetPlayCount:
      isEnabled && input.missionTargetPlayCount != null ? String(input.missionTargetPlayCount) : '',
    missionDurationDays:
      isEnabled && input.missionDurationDays != null ? String(input.missionDurationDays) : '',
    missionChannel:
      isEnabled && input.missionNotifyChannelId ? `<#${input.missionNotifyChannelId}>` : '',
  };
}

/**
 * 전처리 결과가 공백뿐이면 `undefined` 를 반환한다. 호출부는 이 값으로 `setTitle`/
 * `setDescription`/`send` 의 `content` 설정 여부를 결정한다 — discord.js validator 가
 * 빈 문자열 setter 에서 throw 하는 것을 원천 차단하기 위함이다.
 */
export function toOptionalText(value: string): string | undefined {
  return value.trim() === '' ? undefined : value;
}

/**
 * 치환 전 줄 단위 전처리 — 값이 빈 문자열인 미션 변수를 포함한 줄을 통째로 삭제한다.
 * 미션 변수를 포함하지 않는 줄은 판정에 관여하지 않는다(기존 템플릿 동작 보존).
 *
 * 실제로 삭제가 발생했을 때만 연속 빈 줄을 1개로 축약하고 앞뒤 공백을 trim한다.
 * 삭제가 없었다면 원본 문자열을 바이트 단위 그대로 반환한다.
 */
export function stripUnfilledMissionLines(
  template: string,
  missionVarNames: readonly string[],
  vars: Record<string, string>,
): string {
  const lines = template.split('\n');
  let removed = false;

  const kept = lines.filter((line) => {
    const hasUnfilledMissionVar = missionVarNames.some(
      (name) => vars[name] === '' && line.includes(`{${name}}`),
    );
    if (hasUnfilledMissionVar) removed = true;
    return !hasUnfilledMissionVar;
  });

  if (!removed) return template;

  const collapsed: string[] = [];
  for (const line of kept) {
    const isBlank = line.trim() === '';
    const prevIsBlank = collapsed.length > 0 && collapsed[collapsed.length - 1].trim() === '';
    if (isBlank && prevIsBlank) continue;
    collapsed.push(line);
  }

  return collapsed.join('\n').trim();
}

/**
 * 환영 템플릿 렌더 — 미설정 미션 변수 줄 삭제 후 변수를 치환한다.
 * 봇 핸들러의 `applyWelcomeTemplate` + `applyTemplate` 을 이관한 것이다.
 */
export function applyWelcomeTemplate(template: string, vars: Record<string, string>): string {
  const preprocessed = stripUnfilledMissionLines(template, WELCOME_MISSION_VAR_NAMES, vars);
  // replacement를 함수로 전달 — 문자열로 넘기면 user-controlled value(닉네임 등) 내부의
  // `$&`, `$$`, `$'` 같은 특수 패턴이 String.replace의 치환 메타문자로 오해석돼 메시지가 훼손된다.
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.replace(new RegExp(`\\{${key}\\}`, 'g'), () => value),
    preprocessed,
  );
}

/**
 * 템플릿에서 허용 목록에 없는 `{...}` 토큰을 등장 순서·중복 제거로 반환한다(대소문자 구분).
 */
export function findInvalidWelcomeVars(template: string): string[] {
  const allowed: readonly string[] = WELCOME_TEMPLATE_ALLOWED_VARS;
  const found = template.match(WELCOME_VAR_TOKEN_PATTERN) ?? [];
  return [...new Set(found.filter((token) => !allowed.includes(token)))];
}

/** 템플릿에 `@everyone`/`@here` 가 포함되어 있는지 검사한다(대소문자 무시). */
export function hasWelcomeMassMention(template: string): boolean {
  return WELCOME_MASS_MENTION_PATTERN.test(template);
}

/**
 * 이전 값에 없던 대량 멘션 토큰이 새로 들어왔는지 검사한다.
 *
 * `@everyone`·`@here` 를 토큰별로 개별 비교한다(대소문자 무시) — 이전 값에 `@here` 만 있던 필드에
 * `@everyone` 을 추가하는 우회를 막기 위함이다. 이미 있던 토큰은 grandfather 로 간주한다.
 *
 * @param next 신규 입력값
 * @param prev 저장된 이전 값(없으면 null/undefined)
 * @returns next 에 있고 prev 에 없는 토큰이 하나라도 있으면 true
 */
export function hasNewWelcomeMassMention(next: string, prev: string | null | undefined): boolean {
  const nextLower = next.toLowerCase();
  const prevLower = (prev ?? '').toLowerCase();
  return WELCOME_MASS_MENTION_TOKENS.some(
    (token) => nextLower.includes(token) && !prevLower.includes(token),
  );
}

/** 코드포인트 단위 길이 — 서버 검증·웹 카운터·발송 잘라내기가 동일 기준을 쓴다. */
export function countWelcomeTextLength(text: string): number {
  return Array.from(text).length;
}

/** 코드포인트 단위로 `max` 까지 잘라낸다(lone surrogate 없음, 말줄임표 미부착). */
export function truncateWelcomeText(text: string, max: number): string {
  return truncateByCodePoint(text, max);
}
