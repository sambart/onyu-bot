import { describe, expect, it, vi } from 'vitest';

import { isGuildMember } from './guild-member.util';

describe('isGuildMember', () => {
  it('setNickname 과 displayName 을 가진 객체는 GuildMember 로 인정한다', () => {
    expect(isGuildMember({ setNickname: vi.fn(), displayName: 'Alice' })).toBe(true);
  });

  it('null·원시값은 거부한다', () => {
    expect(isGuildMember(null)).toBe(false);
    expect(isGuildMember(undefined)).toBe(false);
    expect(isGuildMember('member')).toBe(false);
  });

  it('raw API 멤버(메서드 없음)는 거부한다', () => {
    expect(isGuildMember({ nick: 'Alice', roles: [] })).toBe(false);
  });
});
