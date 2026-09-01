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
 * Discord embed 렌더 폴백 — `embedColor` 미지정(NULL) 시 API가 적용하는 색.
 * 웹 미리보기·컬러 피커가 표시하는 색과 동일해야 한다(OB-4). newbie
 * `NEWBIE_EMBED_FALLBACK_COLOR_INT`와 같은 역할 — status-prefix는 hex 문자열을 그대로 쓴다.
 */
export const STATUS_PREFIX_EMBED_FALLBACK_COLOR = '#5865F2';

/**
 * 웹 폼 프리필 전용 — 엔티티 컬럼은 전부 nullable이라 시스템 기본값이 아니다.
 * `embedTitle`·`embedDescription`의 한국어 값은 web-dashboard-consistency HITL-4 미결 사안이었으나
 * i18n G2(HITL-4-G2, 2026-08-31)에서 ⓐ안(로케일 분기 도입)으로 결정되며 **본 상수는 로케일화 대상에서
 * 제외**됐다 — `createStatusPrefixConfigDefaults()` → 웹 폼 초기값 경로(`buildDefaultConfig(t)`,
 * `status-prefix/page.tsx`)에서 즉시 덮어써지고, API 측에는 이 값을 읽는 폴백 경로가 0건이라
 * 사용자 도달 경로가 없다(실측: `docs/plans/i18n-g2-default-templates.md` §2.3). 값은 변경하지 않는다
 * (스프레드 셰이프 유지 — 제거하면 `StatusPrefixConfig` 대입 타입이 흔들린다).
 */
export const STATUS_PREFIX_FORM_DEFAULTS = {
  embedTitle: '게임방 상태 설정 시스템',
  embedDescription: '아래 버튼을 클릭하여 닉네임 접두사를 변경할 수 있습니다.',
  embedColor: STATUS_PREFIX_EMBED_FALLBACK_COLOR,
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
