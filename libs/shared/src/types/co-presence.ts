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
