/**
 * Discord `CHANNEL_OBFUSCATED` 채널 플래그(`1 << 17`).
 * discord.js 14.25.1 / discord-api-types 0.38.42 의 `ChannelFlags` enum 에 부재하며
 * 최신판에도 미반영이라 버전 업그레이드 선택지가 없어 자체 정의한다.
 * 근거: docs/reviews/channel-metadata-hiding-impact-review.md §④ "P1 설계 결론"
 */
// eslint-disable-next-line no-magic-numbers -- Discord 플래그 비트 자리수(17번째 비트), 이름 있는 상수로 이미 격리됨
export const CHANNEL_OBFUSCATED_FLAG = 1 << 17;

/** 은닉된 채널·카테고리의 `name` 이 치환되는 Discord 고정 리터럴 */
export const OBFUSCATED_CHANNEL_NAME = '___hidden___';
