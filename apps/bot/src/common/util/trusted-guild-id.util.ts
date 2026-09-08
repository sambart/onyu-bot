/**
 * customId 에서 파싱한 guildId 를 Discord 가 서명·보증하는 `interaction.guildId` 와 대조한다
 * (W5, docs/plans/admin-action-guard-fixes.md §6). customId 는 사용자가 클라이언트에서 위조할 수
 * 있는 값이므로 신뢰 경계로 쓸 수 없다 — 항상 `interaction.guildId` 와 대조한 뒤 그 값을 신뢰
 * 소스로 사용해야 한다(올바른 대조군: `bot-role-panel-interaction.handler.ts`).
 *
 * 순수 함수로 두어(인터랙션 객체를 받지 않음) 단위 테스트가 mock 없이 가능하다. 로깅·거부
 * 응답은 호출 측 책임(핸들러마다 defer 여부가 달라 응답 방식이 다르기 때문).
 *
 * @param interactionGuildId Discord 가 보증하는 인터랙션의 길드 ID(DM 이면 `null`)
 * @param customIdGuildId customId 에서 파싱한(신뢰할 수 없는) 길드 ID
 * @returns 대조 통과 시 `interactionGuildId`(신뢰 소스), 불일치·DM 컨텍스트·빈 문자열이면 `null`
 */
export function resolveTrustedGuildId(
  interactionGuildId: string | null,
  customIdGuildId: string,
): string | null {
  if (interactionGuildId === null) return null;
  if (customIdGuildId === '') return null;
  if (interactionGuildId !== customIdGuildId) return null;
  return interactionGuildId;
}
