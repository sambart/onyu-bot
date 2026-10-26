/** 템플릿 플레이스홀더 패턴 — `BotI18nService` 의 치환 정규식과 같은 의미다. */
const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

/** 템플릿에 대입할 값 맵. 값은 `String()` 으로 문자열화된다. */
export type InterpolateParams = Readonly<Record<string, unknown>>;

/**
 * `{name}` 플레이스홀더를 값으로 치환한다 — 코드 로케일 테이블의 함수형 값을 대체하는 공용 치환기.
 *
 * 계약:
 * - 이름 규칙: `\w+`(영숫자·밑줄)만 플레이스홀더로 인식한다. `{닉네임}`·`{'x'}`·`{}` 같은 것은 그대로 남는다.
 * - 미지정 변수: `params[name] === undefined`(키 없음 포함)이면 `{name}` 을 그대로 남긴다(에러·빈 문자열 아님).
 * - 값 문자열화: 그 외 모든 값은 `String(value)` — 숫자는 10진 표기, `null` 은 `'null'`(템플릿 리터럴 `${null}` 과 등가).
 * - 이스케이프 없음: `{{`·`\{` 같은 이스케이프 문법이 없다. 값에 들어 있는 `{x}` 는 재치환하지 않는다(단일 패스).
 * - 값에 `$&` 같은 특수 패턴이 있어도 글자 그대로 들어간다(치환 함수 사용).
 */
export function interpolate(template: string, params: InterpolateParams = {}): string {
  return template.replace(PLACEHOLDER_PATTERN, (match: string, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * 템플릿에 등장하는 플레이스홀더 이름을 처음 등장 순서대로, 중복 없이 돌려준다.
 * `interpolate` 와 같은 `\w+` 규칙을 쓴다(검증기·spec 공용).
 */
export function extractTemplateParams(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    names.add(match[1]);
  }
  return [...names];
}
