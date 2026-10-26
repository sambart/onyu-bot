import type { LevelChannelActivityItem, LevelNoXpShare } from '../types/level';

/** 비중 비교가 정확히 50% 경계에서 부동소수 오차로 갈리지 않도록 정수 곱으로 비교하기 위한 분모 */
const SHARE_PERCENT_BASE = 100;

/**
 * XP 제외 채널이 최근 활동에서 차지하는 비중을 계산한다(순수 함수 — api 진단 카드와 웹 설정 화면이
 * 같은 판정을 공유한다, F-LVL-33).
 *
 * - `voiceShare` = 제외 채널 체류초 / 전체 채널 체류초. 전체가 0이면 `null`(판정 불가).
 * - `messageShare` = 제외 채널 메시지 수 / 전체 메시지 수. 전체가 0이면 `null`.
 * - `isOverThreshold` = 둘 중 하나라도 `warnRatio` 이상(음성 **또는** 메시지, D2 (a)).
 *
 * @param items - 채널별 활동 합계(음성은 `voice_daily` 채널 행만 합산한 값이어야 한다)
 * @param noXpChannelIds - 제외 채널 후보 집합(저장 전 편집 중인 선택값 포함)
 * @param warnRatio - 경고 임계(0~1)
 */
export function computeNoXpShare(
  items: readonly LevelChannelActivityItem[],
  noXpChannelIds: readonly string[],
  warnRatio: number,
): LevelNoXpShare {
  const excluded = new Set(noXpChannelIds);
  let totalVoiceSec = 0;
  let excludedVoiceSec = 0;
  let totalMessageCount = 0;
  let excludedMessageCount = 0;

  for (const item of items) {
    totalVoiceSec += item.voiceSec;
    totalMessageCount += item.messageCount;
    if (excluded.has(item.channelId)) {
      excludedVoiceSec += item.voiceSec;
      excludedMessageCount += item.messageCount;
    }
  }

  const voiceShare = totalVoiceSec > 0 ? excludedVoiceSec / totalVoiceSec : null;
  const messageShare = totalMessageCount > 0 ? excludedMessageCount / totalMessageCount : null;
  const isOver = (share: number | null): boolean =>
    share !== null &&
    Math.round(share * SHARE_PERCENT_BASE * SHARE_PERCENT_BASE) >=
      Math.round(warnRatio * SHARE_PERCENT_BASE * SHARE_PERCENT_BASE);

  return {
    voiceShare,
    messageShare,
    isVoiceOver: isOver(voiceShare),
    isMessageOver: isOver(messageShare),
    isOverThreshold: isOver(voiceShare) || isOver(messageShare),
  };
}
