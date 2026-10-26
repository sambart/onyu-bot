/**
 * 공용 템플릿 치환기(`@onyu/shared` interpolate) 단위 테스트.
 *
 * shared 는 자체 테스트 러너가 없어 i18n 자산의 테스트를 소유한 봇 프로젝트에 둔다.
 */
import { extractTemplateParams, interpolate } from '@onyu/shared';
import { describe, expect, it } from 'vitest';

describe('interpolate', () => {
  it('플레이스홀더를 값으로 치환하고 같은 이름은 모두 치환한다', () => {
    expect(interpolate('{h}시간 {m}분 ({h}h)', { h: 2, m: 5 })).toBe('2시간 5분 (2h)');
  });

  it('미지정 키는 {key} 그대로 남긴다', () => {
    expect(interpolate('안녕 {name}, {count}건', { count: 3 })).toBe('안녕 {name}, 3건');
    expect(interpolate('{a}')).toBe('{a}');
  });

  it('값이 undefined 이면 미지정과 같이 {key} 를 보존한다', () => {
    expect(interpolate('{a}', { a: undefined })).toBe('{a}');
  });

  it('숫자·null·boolean 은 String() 과 등가(템플릿 리터럴과 동일)이다', () => {
    const nullValue = null;
    expect(interpolate('{n}', { n: 0 })).toBe(`${0}`);
    const fraction = 1.5;
    expect(interpolate('{n}', { n: fraction })).toBe(`${fraction}`);
    expect(interpolate('{n}', { n: nullValue })).toBe(`${nullValue}`);
    expect(interpolate('{n}', { n: false })).toBe('false');
    expect(interpolate('{n}', { n: '' })).toBe('');
  });

  it('값에 $& 같은 특수 패턴이 있어도 글자 그대로 들어간다', () => {
    expect(interpolate('[{v}]', { v: "$& $1 $$ $` $'" })).toBe("[$& $1 $$ $` $']");
  });

  it('값 안의 {x} 는 재치환하지 않는다(단일 패스)', () => {
    expect(interpolate('{a}', { a: '{b}', b: 'X' })).toBe('{b}');
  });

  it("비 \\w 이름({닉네임}·{'x'}·{}·{a b}) 은 무시한다", () => {
    const template = "{닉네임} {'x'} {} {a b}";
    expect(interpolate(template, { 닉네임: 'N', x: 'X', a: 'A' })).toBe(template);
  });

  it('이스케이프 문법이 없다 — {{a}} 는 안쪽만 치환된다', () => {
    expect(interpolate('{{a}}', { a: 'V' })).toBe('{V}');
  });
});

describe('extractTemplateParams', () => {
  it('등장 순서대로 중복 없이 반환한다', () => {
    expect(extractTemplateParams('{b} {a} {b}')).toEqual(['b', 'a']);
  });

  it('플레이스홀더가 없거나 비 \\w 이름뿐이면 빈 배열이다', () => {
    expect(extractTemplateParams('텍스트')).toEqual([]);
    expect(extractTemplateParams("{닉네임} {'x'} {}")).toEqual([]);
  });
});
