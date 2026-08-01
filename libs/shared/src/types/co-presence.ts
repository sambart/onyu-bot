/**
 * voice-co-presence 도메인 마이페이지(F-COPRESENCE-019) 응답 타입.
 * 진실의 소스: docs/specs/endpoint-spec/voice-co-presence.md E1
 */

/** GET /api/users/me/co-presence/top-peers 응답 peer 항목 */
export interface MeTopPeerItem {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  totalMinutes: number;
  sessionCount: number;
}

/** GET /api/users/me/co-presence/top-peers 응답 */
export interface MeTopPeersResponse {
  days: number;
  peers: MeTopPeerItem[];
}

/** GET /api/users/me/co-presence/pairs/:peerId 응답 (E2, F-COPRESENCE-022) */
export interface MePairDetailResponse {
  days: number;
  peer: { userId: string; displayName: string; avatarUrl: string | null };
  totalMinutes: number;
  /** 'YYYY-MM-DD' ASC */
  dailyData: { date: string; minutes: number }[];
}

// ─────────────────────────────────────────────────────────────────────────
// 관리자 대시보드(길드 전체 분석) 응답 타입 — F-COPRESENCE-007~013
// 진실의 소스: apps/api/src/channel/voice/co-presence/co-presence-analytics.service.ts
// ─────────────────────────────────────────────────────────────────────────

/** GET /api/guilds/:guildId/co-presence/summary 응답 (F-COPRESENCE-007) */
export interface CoPresenceSummary {
  activeMemberCount: number;
  totalPairCount: number;
  totalCoPresenceMinutes: number;
  avgPairsPerMember: number;
}

/** GET /api/guilds/:guildId/co-presence/graph 응답 노드 (F-COPRESENCE-008) */
export interface CoPresenceGraphNode {
  userId: string;
  userName: string;
  totalMinutes: number;
}

/** GET /api/guilds/:guildId/co-presence/graph 응답 엣지 (F-COPRESENCE-008) */
export interface CoPresenceGraphEdge {
  userA: string;
  userB: string;
  totalMinutes: number;
  sessionCount: number;
}

/** GET /api/guilds/:guildId/co-presence/graph 응답 (F-COPRESENCE-008) */
export interface CoPresenceGraphData {
  nodes: CoPresenceGraphNode[];
  edges: CoPresenceGraphEdge[];
}

/** 친밀도 TOP N 쌍의 유저 정보 (F-COPRESENCE-009) */
export interface CoPresencePairUser {
  userId: string;
  userName: string;
  avatarUrl: string | null;
}

/** GET /api/guilds/:guildId/co-presence/top-pairs 응답 항목 (F-COPRESENCE-009) */
export interface CoPresenceTopPair {
  userA: CoPresencePairUser;
  userB: CoPresencePairUser;
  totalMinutes: number;
  sessionCount: number;
}

/** GET /api/guilds/:guildId/co-presence/isolated 응답 항목 (F-COPRESENCE-010) */
export interface CoPresenceIsolatedMember {
  userId: string;
  userName: string;
  totalVoiceMinutes: number;
  lastVoiceDate: string;
}

/** GET /api/guilds/:guildId/co-presence/pairs 정렬 컬럼 화이트리스트 (F-COPRESENCE-011) */
export type CoPresencePairsSortBy = 'totalMinutes' | 'sessionCount' | 'lastDate';

/** GET /api/guilds/:guildId/co-presence/pairs 정렬 방향 화이트리스트 (F-COPRESENCE-011) */
export type CoPresencePairsSortOrder = 'ASC' | 'DESC';

/** GET /api/guilds/:guildId/co-presence/pairs 응답 항목 (F-COPRESENCE-011) */
export interface CoPresencePairItem {
  userA: { userId: string; userName: string };
  userB: { userId: string; userName: string };
  totalMinutes: number;
  sessionCount: number;
  lastDate: string;
}

/** GET /api/guilds/:guildId/co-presence/pairs 응답 (F-COPRESENCE-011) */
export interface CoPresencePairsResponse {
  total: number;
  page: number;
  limit: number;
  items: CoPresencePairItem[];
}

/** GET /api/guilds/:guildId/co-presence/daily-trend 응답 항목 (F-COPRESENCE-012) */
export interface CoPresenceDailyTrendPoint {
  date: string;
  totalMinutes: number;
}

/** GET /api/guilds/:guildId/co-presence/pair-detail 응답 (F-COPRESENCE-013) */
export interface CoPresencePairDetail {
  userA: { userId: string; userName: string };
  userB: { userId: string; userName: string };
  totalMinutes: number;
  dailyData: { date: string; minutes: number }[];
}
