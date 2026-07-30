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

/** A1 — 게임별 일자 추이 1행 (F-VOICE-055 확장) */
export interface GameDailyPoint {
  date: string; // YYYYMMDD (KST, PG TO_CHAR 산출값 — 재변환 금지)
  gameName: string;
  totalMinutes: number;
}

/** A2 — 길드 내 내 순위 (RANK() 동률 공유) */
export interface GameRankItem {
  gameName: string;
  rank: number;
  playerCount: number;
  /** 상위 N% — ceil(rank/playerCount*100). playerCount=0 이면 0 */
  topPercent: number;
}

/** E3(/my/voice 개인 카드) 응답 — 구조는 UserGameHistoryDto와 동일, 상한만 축소(서버 LIMIT) */
export interface MeGameProfileDto {
  totalsByGame: GameTotalItem[];
  recentSessions: GameSessionItem[];
  dailyByGame: GameDailyPoint[]; // ★A1 — 상위 3게임, 0 채움(행≥1일 때만)
  ranks: GameRankItem[]; // ★A2 — totalsByGame과 gameName으로 대응
}

/** A4 — 내 게임 세션 동안 같은 음성 채널에 있던 멤버 1명 */
export interface GameCoMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** 겹침 시간(초). 내 게임 세션 ∩ 상대 채널 체류의 합 */
  overlapSec: number;
  /** 함께한 내 게임 세션 수(중복 입퇴장은 1회로 계산) */
  sessionCount: number;
}

/** A4 — 게임 1종의 함께한 멤버 그룹 */
export interface GameCoMemberGroup {
  gameName: string;
  members: GameCoMember[]; // overlapSec DESC(서버 정렬), 최대 CO_MEMBER_PER_GAME_LIMIT
}

/** GET /api/users/me/voice/games/co-members 응답 (A4) */
export interface MeGameCoMembersDto {
  days: number; // 요청 기간 echo(MeTopPeersResponse 선례)
  groups: GameCoMemberGroup[]; // gameTotal DESC, 최대 CO_MEMBER_GAME_LIMIT. 빈 배열이면 서비스가 null 반환
}
