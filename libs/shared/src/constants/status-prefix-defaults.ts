/**
 * `status_prefix_config` 기본값 단일 정본. 엔티티 컬럼 default(`status-prefix-config.orm-entity.ts`)·
 * `status-prefix-reset.service.ts` 폴백·웹 폼 초기값(`status-prefix/page.tsx`)이 모두 본 상수를
 * 참조한다. 값은 기존 소스와 동일 — 본 상수 신설은 기본값 변경이 아니다.
 */
export const STATUS_PREFIX_CONFIG_DEFAULTS = {
  enabled: false,
  prefixTemplate: '[{prefix}] {nickname}',
  channelId: null,
} as const;

/**
 * 웹 폼 프리필 전용 — 엔티티 컬럼은 전부 nullable이라 시스템 기본값이 아니다.
 * ⚠️ `embedTitle`·`embedDescription`의 한국어 값은 web-dashboard-consistency HITL-4 미결 사안이다.
 * 본 상수 신설은 값 변경·i18n화가 아니라 기존 값을 그대로 옮기는 것뿐이며,
 * HITL-4 확정 시 수정 지점이 이 파일 1곳으로 줄어드는 이득만 취한다.
 */
export const STATUS_PREFIX_FORM_DEFAULTS = {
  embedTitle: '게임방 상태 설정 시스템',
  embedDescription: '아래 버튼을 클릭하여 닉네임 접두사를 변경할 수 있습니다.',
  embedColor: '#5865F2',
} as const;

/**
 * 참조형 필드(`buttons`)까지 채운 완전 기본값(호출마다 새 인스턴스).
 * `lastAppliedAt`·`messageId`는 런타임 상태이므로 불포함 — 소비자가 명시한다.
 */
export function createStatusPrefixConfigDefaults() {
  return {
    ...STATUS_PREFIX_CONFIG_DEFAULTS,
    ...STATUS_PREFIX_FORM_DEFAULTS,
    // never[]는 구조적으로 모든 배열 타입에 대입 가능 — 소비처의 버튼 요소 타입(shared 미보유)을
    // 여기서 재선언하지 않고도 `StatusPrefixConfig['buttons']`에 안전히 대입된다.
    buttons: [] as never[],
  };
}

/** `status_prefix_button` 컬럼 default 정본 — 엔티티 `@Column({ default })`가 참조한다. */
export const STATUS_PREFIX_BUTTON_DEFAULTS = {
  sortOrder: 0,
} as const;

export type StatusPrefixConfigDefaults = typeof STATUS_PREFIX_CONFIG_DEFAULTS;

/**
 * Discord 닉네임 최대 길이(문자 수). 접두사 적용 후 닉네임이 이를 초과하면
 * Discord API가 400을 반환하므로, 적용 전 잘라내기(truncate) 판단에 사용한다
 * (`status-prefix-apply.service.ts`의 `buildNicknameWithLimit`).
 */
export const DISCORD_NICKNAME_MAX_LENGTH = 32;
