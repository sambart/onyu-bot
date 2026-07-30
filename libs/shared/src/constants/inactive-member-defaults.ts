/**
 * `inactive_member_config` 기본값 단일 정본. 엔티티 컬럼 default
 * (`inactive-member-config.orm-entity.ts`)와 웹 폼 초기값(`inactive-member/page.tsx`)이
 * 모두 본 상수를 참조한다. 값은 기존 소스와 동일 — 본 상수 신설은 기본값 변경이 아니다.
 */
export const INACTIVE_MEMBER_CONFIG_DEFAULTS = {
  periodDays: 30,
  lowActiveThresholdMin: 30,
  decliningPercent: 50,
  gracePeriodDays: 7,
  autoActionEnabled: false,
  autoRoleAdd: false,
  inactiveRoleId: null,
  removeRoleId: null,
  dmEmbedTitle: null,
  dmEmbedBody: null,
} as const;

/** 웹 폼 프리필 전용 — 엔티티는 nullable(`dmEmbedColor`)이라 시스템 기본값이 아니다. */
export const INACTIVE_MEMBER_FORM_DEFAULTS = {
  dmEmbedColor: '#5865F2',
} as const;

/** 참조형 필드(`excludedRoleIds`)까지 채운 완전 기본값(호출마다 새 인스턴스). */
export function createInactiveMemberConfigDefaults() {
  return {
    ...INACTIVE_MEMBER_CONFIG_DEFAULTS,
    excludedRoleIds: [] as string[],
  };
}

export type InactiveMemberConfigDefaults = typeof INACTIVE_MEMBER_CONFIG_DEFAULTS;
