import { describe, expect, it } from 'vitest';

import { resolveBotApiOptions } from './bot-api.config';

describe('resolveBotApiOptions', () => {
  it('production 에서 BOT_API_KEY 가 없으면 기동을 실패시킨다', () => {
    expect(() =>
      resolveBotApiOptions({ NODE_ENV: 'production', API_BASE_URL: 'http://api:3000' }),
    ).toThrow(/BOT_API_KEY/);
  });

  it('production 에서 BOT_API_KEY 가 공백뿐이어도 실패시킨다', () => {
    expect(() =>
      resolveBotApiOptions({
        NODE_ENV: 'production',
        API_BASE_URL: 'http://api:3000',
        BOT_API_KEY: '   ',
      }),
    ).toThrow(/BOT_API_KEY/);
  });

  it('production 에서 API_BASE_URL 이 없으면 실패시킨다', () => {
    expect(() => resolveBotApiOptions({ NODE_ENV: 'production', BOT_API_KEY: 'k' })).toThrow(
      /API_BASE_URL/,
    );
  });

  it('production 에서 둘 다 있으면 값을 그대로 반환한다', () => {
    expect(
      resolveBotApiOptions({
        NODE_ENV: 'production',
        API_BASE_URL: 'http://api:3000',
        BOT_API_KEY: 'k',
      }),
    ).toEqual({ baseUrl: 'http://api:3000', apiKey: 'k' });
  });

  it('dev·test 는 기존 기본값(localhost, 빈 키)을 유지한다', () => {
    expect(resolveBotApiOptions({ NODE_ENV: 'development' })).toEqual({
      baseUrl: 'http://localhost:3000',
      apiKey: '',
    });
    expect(resolveBotApiOptions({})).toEqual({ baseUrl: 'http://localhost:3000', apiKey: '' });
  });
});
