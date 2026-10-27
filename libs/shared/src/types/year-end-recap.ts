export type RecapWindowPhase = 'not_started' | 'open' | 'ended';

export interface RecapHero {
  kind: 'voice' | 'message';
  unit: 'hour' | 'minute' | 'message';
  value: number; // 정수(버림)
}

/** W1 `data` — 스냅샷 payload v1 의 1차 노출분만. peerId·monthly·topChannels·weekdayDist 없음 */
export interface MeRecapData {
  voiceSeconds: number;
  messageCount: number;
  activeDays: number;
  longestStreak: number;
  hero: RecapHero;
  topChannel: { channelName: string; seconds: number } | null;
  topTextChannel: { channelName: string; messageCount: number } | null;
  peakWeekday: { index: number; ratio: number } | null; // 0=월 … 6=일
  topGame: { gameName: string; minutes: number } | null;
  hottestMonth: { month: number; seconds: number } | null; // 1~12
  bestFriend: { minutes: number; meetDays: number } | null; // 항상 익명 — 식별 키 없음
  activityType: {
    type: string; // 판정기 코드(kebab)
    label: string; // 요청 locale 라벨(ACTIVITY_TYPE_LABEL)
    emoji: string;
    basisFrom: string; // YYYY-MM-DD
    basisTo: string;
  } | null;
}

export interface MeRecapResponse {
  year: number;
  status: 'ready' | 'empty';
  countedFrom: string | null; // YYYY-MM-DD(KST)
  countedTo: string | null;
  generatedAt: string | null; // ISO
  data: MeRecapData | null;
}

export type MeRecapCardResponse =
  | { status: 'ready'; imageBase64: string; generatedAt: string }
  | { status: 'empty'; imageBase64: null; generatedAt: null };

/** B1 응답 — API 와 bot-api-client 가 같은 타입을 쓴다(수기 SDK 드리프트 방지) */
export interface MeRecapBotResponse {
  ok: boolean;
  status: 'ready' | 'empty' | 'not_started' | 'ended';
  data: { imageBase64: string } | null;
  summary: {
    year: number;
    hero: RecapHero;
    messageCount: number;
    activityType: string | null;
    activityTypeLabel: string | null;
  } | null;
}
