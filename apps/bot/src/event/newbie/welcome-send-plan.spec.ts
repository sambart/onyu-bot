/**
 * welcome-send-plan 단위 테스트 — plan §2.3 봇 권한 분기표 · EC-NEWBIE-114~118 · 121~122.
 */
import { describe, expect, it } from 'vitest';

import {
  buildWelcomeTextOnly,
  resolveWelcomeSendPlan,
  type WelcomeChannelPerms,
} from './welcome-send-plan';

function makePerms(overrides: Partial<WelcomeChannelPerms> = {}): WelcomeChannelPerms {
  return { canView: true, canSend: true, canEmbed: true, canAttach: true, ...overrides };
}

describe('resolveWelcomeSendPlan', () => {
  describe('fail-open (perms=null, EC-NEWBIE-118)', () => {
    it("CANVAS 이면 'canvas' (현행 경로)", () => {
      expect(resolveWelcomeSendPlan(null, 'CANVAS')).toBe('canvas');
    });

    it("EMBED 이면 'embed' (현행 경로)", () => {
      expect(resolveWelcomeSendPlan(null, 'EMBED')).toBe('embed');
    });
  });

  describe('발송 불가 → skip (EC-NEWBIE-114)', () => {
    it.each(['CANVAS', 'EMBED'] as const)('%s: ViewChannel 없음이면 skip', (mode) => {
      expect(resolveWelcomeSendPlan(makePerms({ canView: false }), mode)).toBe('skip');
    });

    it.each(['CANVAS', 'EMBED'] as const)('%s: SendMessages 없음이면 skip', (mode) => {
      expect(resolveWelcomeSendPlan(makePerms({ canSend: false }), mode)).toBe('skip');
    });

    it('보기·전송 둘 다 없으면 다른 권한이 모두 있어도 skip', () => {
      expect(resolveWelcomeSendPlan(makePerms({ canView: false, canSend: false }), 'CANVAS')).toBe(
        'skip',
      );
    });
  });

  describe('CANVAS 모드', () => {
    it("AttachFiles 있으면 EmbedLinks 와 무관하게 'canvas'", () => {
      expect(resolveWelcomeSendPlan(makePerms({ canEmbed: true }), 'CANVAS')).toBe('canvas');
      expect(resolveWelcomeSendPlan(makePerms({ canEmbed: false }), 'CANVAS')).toBe('canvas');
    });

    it("AttachFiles 없고 EmbedLinks 있으면 'embed' (EC-NEWBIE-115)", () => {
      expect(resolveWelcomeSendPlan(makePerms({ canAttach: false }), 'CANVAS')).toBe('embed');
    });

    it("AttachFiles·EmbedLinks 둘 다 없으면 'text' (EC-NEWBIE-117)", () => {
      expect(
        resolveWelcomeSendPlan(makePerms({ canAttach: false, canEmbed: false }), 'CANVAS'),
      ).toBe('text');
    });
  });

  describe('EMBED 모드', () => {
    it("EmbedLinks 있으면 'embed' (AttachFiles 무관)", () => {
      expect(resolveWelcomeSendPlan(makePerms({ canAttach: false }), 'EMBED')).toBe('embed');
      expect(resolveWelcomeSendPlan(makePerms({ canAttach: true }), 'EMBED')).toBe('embed');
    });

    it("EmbedLinks 없으면 'text' (EC-NEWBIE-116) — AttachFiles 가 있어도 canvas 로 가지 않는다", () => {
      expect(resolveWelcomeSendPlan(makePerms({ canEmbed: false }), 'EMBED')).toBe('text');
      expect(
        resolveWelcomeSendPlan(makePerms({ canEmbed: false, canAttach: false }), 'EMBED'),
      ).toBe('text');
    });
  });

  it('CANVAS 계획 후 EMBED 로 재판정하면 EmbedLinks 유무로 embed/text 가 갈린다', () => {
    const perms = makePerms({ canEmbed: false });

    expect(resolveWelcomeSendPlan(perms, 'CANVAS')).toBe('canvas');
    expect(resolveWelcomeSendPlan(perms, 'EMBED')).toBe('text');
  });
});

describe('buildWelcomeTextOnly', () => {
  it('content · 제목(굵게) · 설명을 빈 줄로 연결한다', () => {
    expect(buildWelcomeTextOnly({ content: '안녕', title: '제목', description: '설명' })).toBe(
      '안녕\n\n**제목**\n\n설명',
    );
  });

  it('content 가 없으면 생략하고 제목 · 설명만 연결한다', () => {
    expect(buildWelcomeTextOnly({ title: '제목', description: '설명' })).toBe('**제목**\n\n설명');
  });

  it('제목이 없으면 굵게 마크도 붙이지 않는다', () => {
    expect(buildWelcomeTextOnly({ content: '안녕', description: '설명' })).toBe('안녕\n\n설명');
  });

  it('설명이 없으면 생략한다', () => {
    expect(buildWelcomeTextOnly({ content: '안녕', title: '제목' })).toBe('안녕\n\n**제목**');
  });

  it('필드 하나만 있어도 그 필드만 반환한다', () => {
    expect(buildWelcomeTextOnly({ content: '안녕' })).toBe('안녕');
    expect(buildWelcomeTextOnly({ title: '제목' })).toBe('**제목**');
    expect(buildWelcomeTextOnly({ description: '설명' })).toBe('설명');
  });

  it('공백뿐인 필드는 빈 필드로 보고 생략한다', () => {
    expect(buildWelcomeTextOnly({ content: '   ', title: '제목', description: '\n\n' })).toBe(
      '**제목**',
    );
  });

  it('빈 문자열 제목은 굵게 마크(****)를 만들지 않는다', () => {
    expect(buildWelcomeTextOnly({ content: '안녕', title: '', description: '설명' })).toBe(
      '안녕\n\n설명',
    );
  });

  it('전부 비어 있으면 undefined (EC-NEWBIE-121)', () => {
    expect(buildWelcomeTextOnly({})).toBeUndefined();
    expect(buildWelcomeTextOnly({ content: '', title: '', description: '' })).toBeUndefined();
    expect(
      buildWelcomeTextOnly({ content: '  ', title: undefined, description: '\n' }),
    ).toBeUndefined();
  });

  it('합친 길이가 2000 코드포인트를 넘으면 2000 으로 자른다(말줄임표 없음)', () => {
    const result = buildWelcomeTextOnly({
      content: 'a'.repeat(1500),
      description: 'c'.repeat(1500),
    });

    expect(result).toBe(`${'a'.repeat(1500)}\n\n${'c'.repeat(498)}`);
    expect(Array.from(result ?? '')).toHaveLength(2000);
  });

  it('정확히 2000 코드포인트면 자르지 않는다(경계값)', () => {
    expect(buildWelcomeTextOnly({ content: 'a'.repeat(2000) })).toBe('a'.repeat(2000));
  });

  it('서러게이트 쌍(이모지)을 코드포인트 단위로 세어 lone surrogate 없이 자른다', () => {
    const result = buildWelcomeTextOnly({ content: '😀'.repeat(2100) });

    expect(result).toBe('😀'.repeat(2000));
  });

  it('@everyone 등 멘션 문자열은 변형하지 않고 그대로 둔다(알림 차단은 allowedMentions 소관)', () => {
    expect(buildWelcomeTextOnly({ content: '@everyone 환영' })).toBe('@everyone 환영');
  });
});
