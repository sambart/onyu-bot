import type { SettingsAutoActionKind, SettingsAutoActionReasonCode } from '../types/overview';

/** 설정 자동 조치 기록 kind 목록 (F-WEB-043) */
export const SETTINGS_AUTO_ACTION_KINDS = [
  'auto_disabled',
  'channel_deleted',
] as const satisfies readonly SettingsAutoActionKind[];

/** 설정 자동 조치 기록 reasonCode 목록 (DB 컬럼은 코드 enum 이라 CHECK 없음 — 이 목록이 정본) */
export const SETTINGS_AUTO_ACTION_REASON_CODES = [
  'moco_rank_missing_access',
  'moco_rank_unknown_channel',
  'weekly_report_channel_unreachable',
  'weekly_report_send_failed',
  'admin_log_channel_unreachable',
  'channel_deleted',
] as const satisfies readonly SettingsAutoActionReasonCode[];

/**
 * reasonCode → i18n reasonKey(camelCase).
 * FE 는 kind 로 네임스페이스(`autoDisabled.reasons` / `channelDeleted`)를 고른다.
 */
export const SETTINGS_AUTO_ACTION_REASON_KEY: Record<SettingsAutoActionReasonCode, string> = {
  moco_rank_missing_access: 'mocoRankMissingAccess',
  moco_rank_unknown_channel: 'mocoRankUnknownChannel',
  weekly_report_channel_unreachable: 'weeklyReportChannelUnreachable',
  weekly_report_send_failed: 'weeklyReportSendFailed',
  admin_log_channel_unreachable: 'adminLogChannelUnreachable',
  channel_deleted: 'channelDeleted',
};

/** DB 문자열이 기록 kind 인지 좁히는 타입 가드 */
export function isSettingsAutoActionKind(value: string): value is SettingsAutoActionKind {
  return (SETTINGS_AUTO_ACTION_KINDS as readonly string[]).includes(value);
}

/** DB 문자열이 기록 reasonCode 인지 좁히는 타입 가드 */
export function isSettingsAutoActionReasonCode(
  value: string,
): value is SettingsAutoActionReasonCode {
  return (SETTINGS_AUTO_ACTION_REASON_CODES as readonly string[]).includes(value);
}
