import type { GuildMember } from 'discord.js';

/**
 * `interaction.member` 가 완전한 `GuildMember` 인지 좁힌다.
 * 길드 컨텍스트 인터랙션의 member 는 캐시 미스 시 `APIInteractionGuildMember`(raw)나 `null` 로 오며,
 * 이 경우 `setNickname()`·`displayName` 이 없어 무가드 `as GuildMember` 단언은 런타임 TypeError 가 된다.
 * `instanceof` 대신 구조 검사를 쓰는 이유: 테스트 목과 discord.js 내부 서브클래스 모두 통과시키기 위함.
 */
export function isGuildMember(member: unknown): member is GuildMember {
  if (typeof member !== 'object' || member === null) return false;
  const candidate = member as { setNickname?: unknown; displayName?: unknown };
  return typeof candidate.setNickname === 'function' && typeof candidate.displayName === 'string';
}
