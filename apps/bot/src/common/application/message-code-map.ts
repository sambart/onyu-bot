import type { MessageCode } from '@onyu/shared';

import type { BotI18nService } from './bot-i18n.service';

/**
 * 결과 봉투(auto-channel·status-prefix) code → 봇 로케일 키(ns.key) 맵.
 * R4 §3.7 표 기준. 미등록 code 는 result.message 원문으로 폴백한다(H-3.3).
 */
export const MESSAGE_CODE_TO_BOT_KEY: Partial<Record<MessageCode, string>> = {
  // ── auto-channel 결과 ──
  AUTO_CHANNEL_CREATED: 'commands.autoChannelCreated',
  AUTO_CHANNEL_CHOOSE_OPTION: 'commands.autoChannelChooseOption',
  ERR_AUTO_CHANNEL_NOT_IN_VOICE: 'commands.autoChannelNotInVoice',
  ERR_AUTO_CHANNEL_CONFIG_NOT_FOUND: 'commands.autoChannelConfigNotFound',
  ERR_AUTO_CHANNEL_INVALID_CHANNEL: 'commands.autoChannelInvalidChannel',
  ERR_AUTO_CHANNEL_MOVE_FAILED: 'commands.autoChannelMoveError',

  // ── status-prefix 결과 ──
  STATUS_PREFIX_APPLIED: 'commands.statusPrefixApplied',
  STATUS_PREFIX_RESET_DONE: 'commands.statusPrefixResetDone',
  STATUS_PREFIX_RESET_NO_CHANGE: 'commands.statusPrefixResetNoChange',
  ERR_STATUS_PREFIX_BUTTON_NOT_FOUND: 'commands.statusPrefixButtonNotFound',
  ERR_STATUS_PREFIX_INVALID_CONFIG: 'commands.statusPrefixInvalidConfig',
  ERR_STATUS_PREFIX_SERVER_CONFIG_NOT_FOUND: 'commands.statusPrefixServerConfigNotFound',
  ERR_STATUS_PREFIX_APPLY_FAILED: 'commands.statusPrefixApplyError',
  ERR_STATUS_PREFIX_RESET_FAILED: 'commands.statusPrefixResetError',
};

/** result.code 가 매핑 테이블에 등록된 MessageCode 인지 판별하는 타입 가드 (unsafe `as` 단언 대체). */
function isMappedMessageCode(code: string): code is MessageCode {
  return code in MESSAGE_CODE_TO_BOT_KEY;
}

/**
 * result.code 를 로케일 문구로 해석한다.
 * 우선순위: code 매핑 키 → (키 존재 시) 번역 / (미존재·미매핑·code 부재 시) result.message 원문(H-3.3, H-6).
 * raw code/로케일 key 를 사용자에게 절대 노출하지 않는다.
 */
export function resolveResultMessage(
  i18n: BotI18nService,
  locale: string,
  result: { code?: string; params?: Record<string, string | number>; message: string },
): string {
  const key =
    result.code && isMappedMessageCode(result.code)
      ? MESSAGE_CODE_TO_BOT_KEY[result.code]
      : undefined;
  if (!key) return result.message; // 미매핑/구 API → message
  const translated = i18n.t(locale, key, result.params);
  return translated === key ? result.message : translated; // 키 미존재 → message
}
