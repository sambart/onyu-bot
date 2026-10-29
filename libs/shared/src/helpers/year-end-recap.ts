import {
  RECAP_AUTO_POST_END_MMDD,
  RECAP_WINDOW_END_MMDD,
  RECAP_WINDOW_START_MMDD,
  RECAP_YEAR,
} from '../constants/year-end-recap';
import type { RecapHero, RecapWindowPhase } from '../types/year-end-recap';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
const MIN_MESSAGE_COUNT_FOR_HERO = 1;

/**
 * KST 달력 일자 문자열 비교로 창 단계를 판정한다(P-8 — 양끝 포함).
 * 창은 `year`-12-15 ~ `year+1`-01-15 (KST 달력 일자, 양끝 포함)이며 `year` 기본값은 RECAP_YEAR.
 * 시각이 아닌 YYYYMMDD 문자열로 비교해 경계(12-15 00:00, 01-15 23:59:59.999)에서 오차가 없다.
 *
 * @param now 판정 기준 시각
 * @param year 결산 연도(생략 시 RECAP_YEAR)
 * @returns 창 시작 전 'not_started' · 창 안 'open' · 창 종료 후 'ended'
 */
export function getRecapWindowPhase(now: Date, year: number = RECAP_YEAR): RecapWindowPhase {
  const today = new Date(now.getTime() + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');
  const start = `${year}${RECAP_WINDOW_START_MMDD}`;
  const end = `${year + 1}${RECAP_WINDOW_END_MMDD}`;

  if (today < start) return 'not_started';
  if (today > end) return 'ended';
  return 'open';
}

/**
 * 서버 결산 자동 게시 기간 여부 — KST `year`-12-15 ~ `year`-12-31 (달력 일자, 양끝 포함).
 * 노출 창(익년 01-15까지)과 달리 종료가 같은 해 12-31 이다. 스케줄러·상태 계산 공용.
 * 일자 문자열 비교라 경계(12-15 00:00, 12-31 23:59:59.999)에서 오차가 없다.
 *
 * @param now 판정 기준 시각
 * @param year 결산 연도(생략 시 RECAP_YEAR)
 * @returns 자동 게시 기간 안이면 true
 */
export function isRecapAutoPostPeriod(now: Date, year: number = RECAP_YEAR): boolean {
  const today = new Date(now.getTime() + KST_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');
  return (
    today >= `${year}${RECAP_WINDOW_START_MMDD}` && today <= `${year}${RECAP_AUTO_POST_END_MMDD}`
  );
}

/**
 * 히어로 결정(P-7): voice≥3600 → {voice,hour,floor(s/3600)} · msg≥1 → {message,message,msg}
 * · voice≥60 → {voice,minute,floor(s/60)} · 그 외 null(E3).
 *
 * @param voiceSeconds 연간 음성 체류 초
 * @param messageCount 연간 메시지 수
 * @returns 히어로 값, 카드 미생성 대상(E3)이면 null
 */
export function resolveRecapHero(voiceSeconds: number, messageCount: number): RecapHero | null {
  if (voiceSeconds >= SECONDS_PER_HOUR) {
    return { kind: 'voice', unit: 'hour', value: Math.floor(voiceSeconds / SECONDS_PER_HOUR) };
  }
  if (messageCount >= MIN_MESSAGE_COUNT_FOR_HERO) {
    return { kind: 'message', unit: 'message', value: messageCount };
  }
  if (voiceSeconds >= SECONDS_PER_MINUTE) {
    return { kind: 'voice', unit: 'minute', value: Math.floor(voiceSeconds / SECONDS_PER_MINUTE) };
  }
  return null;
}

/**
 * E3(빈 결산) 판정 — resolveRecapHero(...) === null.
 *
 * @param voiceSeconds 연간 음성 체류 초
 * @param messageCount 연간 메시지 수
 */
export function isRecapEmpty(voiceSeconds: number, messageCount: number): boolean {
  return resolveRecapHero(voiceSeconds, messageCount) === null;
}

/**
 * 결산 도메인의 "지금" 을 계산한다 — QA 시각 오버라이드(P-51)의 단일 규칙.
 * production 이 아니고 `override`(ISO 8601)가 유효할 때만 그 시각을 돌려주고, 그 외에는 `now` 를 돌려준다.
 * 환경변수 읽기는 호출 앱이 맡는다(web 은 `NEXT_PUBLIC_*` 정적 접근이 필요해 읽는 방식이 앱마다 다르다).
 *
 * @param override 환경변수 원문(없으면 undefined)
 * @param isProduction production 여부 — true 면 오버라이드를 무시한다
 * @param now 오버라이드가 없을 때 쓸 현재 시각(테스트 주입용, 기본 new Date())
 */
export function resolveRecapNow(
  override: string | undefined,
  isProduction: boolean,
  now: Date = new Date(),
): Date {
  if (!override || isProduction) return now;
  const parsed = new Date(override);
  return Number.isNaN(parsed.getTime()) ? now : parsed;
}
