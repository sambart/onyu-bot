import {
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
