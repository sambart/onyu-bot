/**
 * 자동방 설정 개선 1차(F-VOICE-148~150) 공유 계약 — api DTO · 봇 핸들러 · 웹 폼이 같은 값을 쓴다.
 * 근거: docs/plans/auto-channel-room-control.md P1·P6·P7
 * 2차(F-VOICE-152·153): 생성 메시지·음성 채널 상태 상한과 저장 경고 계약 — docs/plans/auto-channel-creation-message-status.md P1·P13
 */

/** 제어 패널 버튼 customId 접두 — `auto_ctl:{action}:{channelId}` (API 패널 조립 · 봇 파싱 공용) */
export const AUTO_CHANNEL_CONTROL_BUTTON_PREFIX = 'auto_ctl:';

/** 정원 변경 모달 customId 접두 — `auto_ctl_modal:limit:{channelId}`. 버튼 접두와 startsWith 로 겹치지 않는다 */
export const AUTO_CHANNEL_CONTROL_MODAL_PREFIX = 'auto_ctl_modal:';

/** 제어 패널 액션 */
export const AUTO_CHANNEL_CONTROL_ACTION = {
  LIMIT: 'limit',
  LOCK: 'lock',
  UNLOCK: 'unlock',
} as const;
export type AutoChannelControlAction =
  (typeof AUTO_CHANNEL_CONTROL_ACTION)[keyof typeof AUTO_CHANNEL_CONTROL_ACTION];

/** 정원 모달의 텍스트 입력 customId */
export const AUTO_CHANNEL_CONTROL_LIMIT_INPUT_ID = 'userLimit';

/** 버튼 customId 조립: `auto_ctl:{action}:{channelId}` */
export function buildAutoChannelControlButtonId(
  action: AutoChannelControlAction,
  channelId: string,
): string {
  return `${AUTO_CHANNEL_CONTROL_BUTTON_PREFIX}${action}:${channelId}`;
}

/** 정원 모달 customId 조립: `auto_ctl_modal:limit:{channelId}` */
export function buildAutoChannelControlLimitModalId(channelId: string): string {
  return `${AUTO_CHANNEL_CONTROL_MODAL_PREFIX}${AUTO_CHANNEL_CONTROL_ACTION.LIMIT}:${channelId}`;
}

/** 음성 채널 정원 범위 (0 = 무제한) */
export const AUTO_CHANNEL_USER_LIMIT_MIN = 0;
export const AUTO_CHANNEL_USER_LIMIT_MAX = 99;

/** 음성 채널 비트레이트 범위 (bps) — 실제 상한은 서버 부스트 등급에 따라 다르다 */
export const AUTO_CHANNEL_BITRATE_MIN = 8000;
export const AUTO_CHANNEL_BITRATE_MAX = 384000;

/** 빈 방 삭제 지연 상한(분) — 0 = 즉시 삭제(현행) */
export const AUTO_CHANNEL_EMPTY_DELETE_DELAY_MIN_MINUTES = 0;
export const AUTO_CHANNEL_EMPTY_DELETE_DELAY_MAX_MINUTES = 10;

/** 잠금 시 봇이 보내는 channelMemberIds 상한 = 정원 상한 99 + 1 */
export const AUTO_CHANNEL_CONTROL_MEMBER_IDS_MAX = 100;

/**
 * 음성 채널 지역(rtc_region) 허용 목록. 출처: Discord `GET /voice/regions` 공개 목록 스냅샷.
 * DB CHECK 를 두지 않으므로 이 배열만 고치면 된다(마이그레이션 불필요).
 */
export const AUTO_CHANNEL_RTC_REGIONS = [
  'brazil',
  'hongkong',
  'india',
  'japan',
  'rotterdam',
  'singapore',
  'south-korea',
  'southafrica',
  'sydney',
  'us-central',
  'us-east',
  'us-south',
  'us-west',
] as const;
export type AutoChannelRtcRegion = (typeof AUTO_CHANNEL_RTC_REGIONS)[number];

/** 생성 메시지 저장 상한 (JS .length 기준) — api DTO `@MaxLength` 와 웹 입력이 같은 값을 쓴다 */
export const AUTO_CHANNEL_CREATION_MESSAGE_MAX_LENGTH = 1500;
/** 음성 채널 상태 템플릿 저장 상한 — Discord 음성 채널 상태 한도(500)와 같다 */
export const AUTO_CHANNEL_STATUS_TEMPLATE_MAX_LENGTH = 500;

/** 저장 응답 경고 code (MESSAGE_CODE 와 별개 — 오류가 아니라 저장 성공 뒤의 안내) */
export const AUTO_CHANNEL_SAVE_WARNING_CODE = {
  VOICE_STATUS_PERMISSION_MISSING: 'VOICE_STATUS_PERMISSION_MISSING',
} as const;
export type AutoChannelSaveWarningCode =
  (typeof AUTO_CHANNEL_SAVE_WARNING_CODE)[keyof typeof AUTO_CHANNEL_SAVE_WARNING_CODE];

/** 음성 채널 상태 설정에 필요한 봇 권한 이름 */
export type AutoChannelVoiceStatusPermissionName = 'setVoiceChannelStatus' | 'manageChannels';

/** 자동방 저장 응답의 경고 1건 — 경고가 있을 때만 응답에 `warnings` 키가 실린다 */
export interface AutoChannelSaveWarning {
  code: typeof AUTO_CHANNEL_SAVE_WARNING_CODE.VOICE_STATUS_PERMISSION_MISSING;
  missingPermissions: AutoChannelVoiceStatusPermissionName[];
}
