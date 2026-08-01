import type { MessageCode } from '../constants/message-codes';

/**
 * 저장 자체는 성공했으나 Discord 부수효과가 실패했을 때 200 응답에 함께 싣는 봉투.
 * NestJS 예외 바디의 code/params(4xx·5xx 용)와 구분된다.
 * 성공 시에는 두 필드 모두 생략한다(UC AF-05 — 정상 케이스 스키마 불변).
 */
export interface DiscordFailureEnvelope {
  errorCode?: MessageCode;
  errorParams?: { channelId: string };
}
