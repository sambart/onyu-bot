/**
 * 뱃지 이미지 에셋 파일명 규약 단일 정본(badge-image-assets D4).
 * api(파일시스템 `apps/api/assets/badges/`)·web(public URL `apps/web/public/badges/`) 양쪽이
 * 이 규약을 공유한다 — 뱃지 색상(`bgColor`/`textColor`)·한국어 이름은 승격하지 않는다(각 앱이
 * 이미 다른 형태로 갖고 있어 억지 공통화가 오히려 불편해진다, D4 근거 참조).
 */
export const VOICE_HEALTH_BADGE_CODES = [
  'ACTIVITY',
  'SOCIAL',
  'HUNTER',
  'CONSISTENT',
  'MIC',
  'STREAK',
  'CHATTER',
] as const;

export type VoiceHealthBadgeCode = (typeof VOICE_HEALTH_BADGE_CODES)[number];

/**
 * 뱃지 코드 → 에셋 파일명(`{code.toLowerCase()}.png`). `apps/api/scripts/build-badge-assets.mjs`가
 * 생성하는 산출물 파일명과 동일 규약이며, api 런타임 로더·web 컴포넌트가 이 함수로 경로를 조립한다.
 */
export function toBadgeAssetFileName(code: VoiceHealthBadgeCode): string {
  return `${code.toLowerCase()}.png`;
}

/** 웹 `/public/badges/` 기준 경로 — `apps/web/public/badges/{file}`이 이 경로 아래로 서빙된다. */
export const WEB_BADGE_ASSET_BASE_PATH = '/badges';
