/**
 * 자동방 생성 직후 안내(F-VOICE-152 생성 메시지 · F-VOICE-153 음성 채널 상태) 순수 헬퍼.
 * 근거: docs/plans/auto-channel-creation-message-status.md P4·P5·P6
 *
 * 이 모듈은 i18n 과 Discord 를 모른다 — 치환·절단만 한다.
 */

/** 리터럴 `{n}` 넘버링 토큰 (채널 목록 조회 후 정해지는 값이라 생성 직후 문구에서는 쓸 수 없다) */
const AUTO_NUMBER_TOKEN = '{n}';

type NoticeTokenKey = 'username' | 'name' | 'input';

/** 치환 대상 토큰 — `auto-channel-name.ts` 의 토큰 상수 3종과 같은 집합 */
const NOTICE_TOKEN_PATTERN = /\{(username|name|input)\}/g;

/** 말줄임 문자 (1자) */
const NOTICE_ELLIPSIS = '…';

const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;

/** 생성 메시지·상태 템플릿의 치환값 */
export interface AutoChannelNoticeTokens {
  /** `{username}` — 방 생성자의 서버 닉네임 */
  userName: string;
  /** `{name}` — 버튼 기본 채널명(`{n}` 제거 완료값). instant 는 '' */
  name: string;
  /** `{input}` — 방제 입력값. 입력이 없으면 null/undefined = '' */
  input?: string | null;
}

/**
 * `{name}` 값에서 `{n}` 토큰을 전부 제거하고 trim 한다(P4).
 * 리터럴 `{n}` 이 방에 게시되는 것을 막기 위한 것이다.
 */
export function stripAutoChannelNumberToken(name: string): string {
  return name.split(AUTO_NUMBER_TOKEN).join('').trim();
}

/**
 * 생성 메시지·상태 템플릿 치환. `{username}`·`{name}`·`{input}` 을 전부 치환한다.
 *
 * 정규식 1패스 + 함수 대체라 치환된 값 안의 토큰은 재치환되지 않는다(EC-ACNI-129). 대체를
 * 문자열이 아닌 함수로 하므로 닉네임·입력값 안의 `$&`·`$1`·`` $` `` 같은 대체 패턴도 해석되지
 * 않는다(EC-ACNI-128).
 * 단 `name` 은 관리자 설정값이라, 그 안에 남은 `{input}` 만 먼저 입력값으로 해소한 뒤 치환한다.
 */
export function applyAutoChannelNoticeTokens(
  template: string,
  tokens: AutoChannelNoticeTokens,
): string {
  const input = tokens.input ?? '';
  const values: Record<NoticeTokenKey, string> = {
    username: tokens.userName,
    name: tokens.name.replace(/\{input\}/g, () => input),
    input,
  };
  return template.replace(NOTICE_TOKEN_PATTERN, (_match, key: NoticeTokenKey) => values[key]);
}

/**
 * 안내 문구를 `max`(JS `.length`) 이하로 자른다.
 * 자르는 위치가 서로게이트 쌍 중간이면 1자 더 줄여 깨진 반쪽 문자를 보내지 않는다.
 * `ellipsis` 가 true 면 끝에 `…` 를 붙이되 `…` 를 포함한 길이가 `max` 이하가 되게 한다.
 *
 * @returns `truncated` 가 true 면 원문이 잘렸다
 */
export function truncateAutoChannelNotice(
  text: string,
  max: number,
  options: { ellipsis: boolean },
): { text: string; truncated: boolean } {
  if (text.length <= max) {
    return { text, truncated: false };
  }

  const budget = options.ellipsis ? Math.max(max - NOTICE_ELLIPSIS.length, 0) : max;
  let cut = budget;
  if (cut > 0 && isHighSurrogate(text.charCodeAt(cut - 1))) {
    cut -= 1;
  }

  const body = text.slice(0, cut);
  return { text: options.ellipsis ? `${body}${NOTICE_ELLIPSIS}` : body, truncated: true };
}

function isHighSurrogate(charCode: number): boolean {
  return charCode >= HIGH_SURROGATE_MIN && charCode <= HIGH_SURROGATE_MAX;
}
