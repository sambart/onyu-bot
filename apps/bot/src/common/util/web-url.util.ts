/** WEB_URL 미설정 시 prod 도메인 — 봇 전역 단일 폴백(localhost 폴백은 prod 링크 오염 위험이라 금지) */
export const DEFAULT_WEB_URL = 'https://onyu.dev';

/**
 * 대시보드 기본 URL 을 반환한다.
 * WEB_URL 은 호출 시점에 읽는다 — 모듈 import 시점에 평가하면 ConfigModule 의 .env 로드 전이라
 * 폴백이 굳을 수 있다. 빈 문자열도 미설정으로 취급하고, 말미 슬래시는 제거해 경로 결합을 안전하게 한다.
 * 순수 함수로 두어(DI 비의존) 커맨드·핸들러 어디서나 mock 없이 쓴다.
 */
export function getWebUrl(): string {
  const raw = process.env['WEB_URL']?.trim();
  if (!raw) return DEFAULT_WEB_URL;
  return raw.replace(/\/+$/, '');
}
