/**
 * message-tracking 도메인 일별 통계 조회 응답 타입 (E2, GET /api/guilds/:guildId/message-tracking/daily).
 * 메시지 내용(content)은 포함하지 않는다 — 채널·유저별 메시지 "수"만 집계한다 (PRD §2 프라이버시 원칙).
 */
export interface MessageDailyRecord {
  guildId: string;
  userId: string;
  userName: string;
  date: string; // YYYYMMDD (KST)
  channelId: string;
  channelName: string;
  messageCount: number;
}

/** F-MSG-009 응답 요소 — voice_daily + message_daily date 병합 파생 (E5, 테이블 아님) */
export interface ActivityDailyOverview {
  date: string; // YYYYMMDD (KST)
  voiceDurationSec: number; // voice_daily.channelDurationSec SUM (channelId != 'GLOBAL'), 없으면 0
  messageCount: number; // message_daily.messageCount SUM, 없으면 0
}

/** F-MSG-010 응답 요소 — message_daily 유저별 합산 랭킹 (E3, 테이블 아님) */
export interface MessageRankingRecord {
  userId: string;
  userName: string;
  messageCount: number;
}
