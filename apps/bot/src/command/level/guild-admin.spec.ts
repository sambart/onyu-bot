/**
 * isGuildAdmin() 단위 테스트(U10, F-LVL-27).
 *
 * `/랭킹`·`/rank`·`/me` 리더보드 버튼 3표면이 bot-api로 보내는 `requesterIsGuildAdmin`의
 * 유일한 판정 근거다. 소비처(rank.command.spec.ts 등)의 기존 테스트는 `memberPermissions.any`를
 * `mockReturnValue(true/false)`로 스텁하기 때문에 "ManageGuild만 있어도 관리자로 인정한다"는
 * 문서화된 계약(Administrator 단독이 아니라 두 권한 OR)이 실제로 `.any()`에 전달되는 인자로
 * 검증되지 않는다 — 이 파일이 그 공백을 메운다.
 */
import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';

import { isGuildAdmin } from './guild-admin';

function makeInteraction(
  memberPermissions: { any: ReturnType<typeof vi.fn> } | null,
): ChatInputCommandInteraction {
  return { memberPermissions } as unknown as ChatInputCommandInteraction;
}

describe('isGuildAdmin', () => {
  it('memberPermissions.any를 Administrator/ManageGuild 두 플래그로 호출한다', () => {
    const any = vi.fn().mockReturnValue(true);
    isGuildAdmin(makeInteraction({ any }));

    expect(any).toHaveBeenCalledWith([
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild,
    ]);
  });

  it('any()가 true를 반환하면(Administrator 또는 ManageGuild 보유) true를 반환한다', () => {
    const result = isGuildAdmin(makeInteraction({ any: vi.fn().mockReturnValue(true) }));

    expect(result).toBe(true);
  });

  it('any()가 false를 반환하면(둘 다 미보유) false를 반환한다', () => {
    const result = isGuildAdmin(makeInteraction({ any: vi.fn().mockReturnValue(false) }));

    expect(result).toBe(false);
  });

  it('memberPermissions가 null이면(방어) fail-closed로 false를 반환한다(D5)', () => {
    const result = isGuildAdmin(makeInteraction(null));

    expect(result).toBe(false);
  });

  it('memberPermissions가 undefined이면(방어) fail-closed로 false를 반환한다', () => {
    const interaction = { memberPermissions: undefined } as unknown as ButtonInteraction;

    expect(isGuildAdmin(interaction)).toBe(false);
  });

  it('ButtonInteraction(카드 이전/다음 버튼 클릭자)에도 동일하게 동작한다', () => {
    const any = vi.fn().mockReturnValue(true);
    const interaction = { memberPermissions: { any } } as unknown as ButtonInteraction;

    expect(isGuildAdmin(interaction)).toBe(true);
    expect(any).toHaveBeenCalledWith([
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild,
    ]);
  });
});
