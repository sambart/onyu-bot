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
  /** 값의 의미 = 서버 표시명(guild_member.displayName 우선, 미동기 유저만 수집값 폴백) — R3(2026-08-07). 필드명은 하위 호환으로 userName 유지(계획 §D5) */
  userName: string;
  messageCount: number;
}

/**
 * F-MSG-015 응답 요소 — voice_daily 유저별 합산 랭킹 (E6, 테이블 아님, R3 신규).
 * 필드명이 MessageRankingRecord.userName 과 다른 것은 의도된 상태다 — E3는 이미 배포된
 * 응답 계약이라 `userName`을 유지하고(값 의미만 "서버 표시명"으로 교정), E6는 신규 API라
 * 하위 호환 제약 없이 처음부터 `displayName`으로 명명했다(PRD F-MSG-015, 계획 §D5).
 */
export interface VoiceRankingRecord {
  userId: string;
  /** 서버 표시명 — guild_member.displayName 우선, 미동기 유저만 voice_daily.userName 폴백, 둘 다 없으면 '' */
  displayName: string;
  /** 기간 내 유저별 음성 체류시간 합계(초) — SUM(channelDurationSec) */
  voiceDurationSec: number;
}
