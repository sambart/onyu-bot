import type { BotApiClientModuleOptions } from '@onyu/bot-api-client';

const DEFAULT_API_BASE_URL = 'http://localhost:3000';

/**
 * 봇→API 클라이언트 옵션을 환경변수에서 해석한다.
 * production 에서 BOT_API_KEY 가 비었거나 API_BASE_URL 이 없으면 기동을 실패시킨다 —
 * 빈 키로 뜬 봇은 모든 bot-api 호출이 401 이 되는데 로그에는 상세가 남지 않아 진단이 어렵다.
 * dev·test 는 기존 기본값(localhost, 빈 키)을 유지한다.
 */
export function resolveBotApiOptions(env: NodeJS.ProcessEnv): BotApiClientModuleOptions {
  const apiKey = env.BOT_API_KEY ?? '';
  const baseUrl = env.API_BASE_URL ?? '';

  if (env.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (apiKey.trim() === '') missing.push('BOT_API_KEY');
    if (baseUrl.trim() === '') missing.push('API_BASE_URL');
    if (missing.length > 0) {
      throw new Error(
        `[BOT-API] NODE_ENV=production 에서는 ${missing.join(', ')} 설정이 필수입니다. ` +
          '미설정 상태로 기동하면 모든 봇→API 호출이 인증 실패(401)로 끝납니다.',
      );
    }
  }

  return { baseUrl: baseUrl === '' ? DEFAULT_API_BASE_URL : baseUrl, apiKey };
}
