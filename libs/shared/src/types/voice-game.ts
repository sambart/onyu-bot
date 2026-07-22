/**
 * voice 도메인 게임 통계 웹 노출(U3a) 응답 타입.
 * E1(길드 랭킹) / E2(운영자 유저별 이력) / E3(본인 게임 카드) 3개 엔드포인트가 공유한다.
 * 진실의 소스: docs/specs/endpoint-spec/voice-game.md §6
 */

/** E1(길드 게임 랭킹) 응답 요소 — 게임별 합산 + 플레이어 수 */
export interface GameSummaryItem {
  rank: number;
  gameName: string;
  totalMinutes: number;
  sessionCount: number;
  playerCount: number;
}

/** E2/E3 게임별 합산 요소 — GameSummaryItem에서 playerCount 제외(단일 유저) */
export interface GameTotalItem {
  rank: number;
  gameName: string;
  totalMinutes: number;
  sessionCount: number;
}

/** E2/E3 최근 세션 요소 — voice_game_activity 1행 */
export interface GameSessionItem {
  gameName: string;
  startedAt: string; // ISO 8601
  endedAt: string | null; // nullable (스키마 사실 반영)
  durationMin: number | null;
}

/** E2(운영자 UserDetailView) 응답 */
export interface UserGameHistoryDto {
  totalsByGame: GameTotalItem[];
  recentSessions: GameSessionItem[];
}

/** E3(/my/voice 개인 카드) 응답 — 구조는 UserGameHistoryDto와 동일, 상한만 축소(서버 LIMIT) */
export interface MeGameProfileDto {
  totalsByGame: GameTotalItem[];
  recentSessions: GameSessionItem[];
}
