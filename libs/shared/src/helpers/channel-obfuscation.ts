import { CHANNEL_OBFUSCATED_FLAG, OBFUSCATED_CHANNEL_NAME } from '../constants/channel-obfuscation';

/**
 * Discord 채널 은닉(channel obfuscation) 판별 헬퍼.
 *
 * discord.js 타입에 의존하지 않는다 — 호출부(봇 `apps/bot`, API `apps/api`)가 각자의
 * raw 값(`number` / `string`)만 넘긴다. 그래야 봇 전용 유틸을 따로 만들지 않고
 * `@onyu/shared` 하나를 양쪽에서 그대로 쓸 수 있다.
 *
 * 판별은 항상 "비트 검사 OR 문자열 검사"다. 둘 중 하나만 쓰면 안 된다 — 이유 3가지
 * (docs/reviews/channel-metadata-hiding-impact-review.md §④ "P1 설계 결론" 근거):
 *
 * 1. **캐시 갱신 지연 헤지** — 게이트웨이 캐시가 아직 갱신되지 않아 `flags` 비트가
 *    꺼져 있는데 이름만 은닉 리터럴로 먼저 도착하는 창이 있을 수 있다. 문자열 판별이
 *    그 창을 덮는다.
 * 2. **라이브러리 미지원 헤지** — discord.js 14.25.1 / discord-api-types 0.38.42 의
 *    `ChannelFlags` 는 이 비트(`1<<17`)를 모른다(최신판도 미반영). `ChannelFlagsBitField` 가
 *    현재는 미지 비트를 raw bitfield 에 보존함이 실측됐지만, 상류 버전업으로 그 처리
 *    방식이 바뀌면 비트 검사만으로는 조용히 무력화될 수 있다. 문자열 판별이 최후 방어선이다.
 * 3. **API 측은 문자열 판별이 유일 수단** — 봇→API payload(`VoiceStateUpdateDto` /
 *    `VoiceSyncUser`)에는 `flags` 가 실려 있지 않다. API 2차 방어는 구조적으로
 *    문자열 판별만 가능하므로, 봇 측은 비트+문자열 이중 판별을, API 측은 문자열 단독
 *    판별(`isObfuscatedChannelName`)을 쓴다.
 */

/**
 * 이름 문자열만으로 은닉 여부를 판정한다.
 * API 측 2차 방어 전용 — 봇→API payload 에는 `flags` 가 없어 문자열 판별만 가능하다(위 이유 3).
 */
export function isObfuscatedChannelName(name?: string | null): boolean {
  return name === OBFUSCATED_CHANNEL_NAME;
}

/**
 * 채널 플래그 비트 + 이름 문자열 이중 판별. 봇 측 전용.
 * discord.js 타입에 의존하지 않도록 raw 값(number/string)만 받는다 — 호출부에서
 * `channel.flags?.bitfield` 를 넘긴다.
 */
export function isObfuscatedChannel(flagsBitfield?: number | null, name?: string | null): boolean {
  return ((flagsBitfield ?? 0) & CHANNEL_OBFUSCATED_FLAG) !== 0 || isObfuscatedChannelName(name);
}
