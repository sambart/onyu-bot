/**
 * resolveTrustedGuildId 단위 테스트 (docs/plans/admin-action-guard-fixes.md W5, §10.5 #44).
 */
import { resolveTrustedGuildId } from './trusted-guild-id.util';

describe('resolveTrustedGuildId', () => {
  it('일치하면 interactionGuildId(신뢰 소스)를 반환한다', () => {
    expect(resolveTrustedGuildId('guild-1', 'guild-1')).toBe('guild-1');
  });

  it('불일치하면 null 을 반환한다', () => {
    expect(resolveTrustedGuildId('guild-1', 'guild-2')).toBeNull();
  });

  it('interactionGuildId 가 null(DM)이면 null 을 반환한다', () => {
    expect(resolveTrustedGuildId(null, 'guild-1')).toBeNull();
  });

  it('customIdGuildId 가 빈 문자열이면 null 을 반환한다', () => {
    expect(resolveTrustedGuildId('guild-1', '')).toBeNull();
  });

  it('둘 다 빈 값(interactionGuildId=null, customIdGuildId="")이어도 null 을 반환한다', () => {
    expect(resolveTrustedGuildId(null, '')).toBeNull();
  });
});
