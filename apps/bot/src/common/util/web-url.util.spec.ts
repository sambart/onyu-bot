import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_WEB_URL, getWebUrl } from './web-url.util';

describe('getWebUrl', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env['WEB_URL'];
  });

  afterEach(() => {
    if (original === undefined) delete process.env['WEB_URL'];
    else process.env['WEB_URL'] = original;
  });

  it('WEB_URL 미설정이면 prod 기본값(localhost 아님)을 반환한다', () => {
    delete process.env['WEB_URL'];
    expect(getWebUrl()).toBe(DEFAULT_WEB_URL);
    expect(DEFAULT_WEB_URL).not.toContain('localhost');
  });

  it('빈 문자열·공백도 미설정으로 취급한다', () => {
    process.env['WEB_URL'] = '  ';
    expect(getWebUrl()).toBe(DEFAULT_WEB_URL);
  });

  it('설정값을 호출 시점에 읽고 말미 슬래시를 제거한다', () => {
    process.env['WEB_URL'] = 'https://stg.example.com/';
    expect(getWebUrl()).toBe('https://stg.example.com');
  });
});
