/** 개인(user-scoped) LLM 쿼터 1건 (GET /api/users/me/quota 응답 요소, F-GEMINI-011) */
export interface MeQuotaItem {
  /** 개인 풀 등재 scope. 서버 등재 목록이 단일 출처이며 신규 추가 시 이 유니온도 갱신한다 */
  scope: 'best-friend' | 'me-ment';
  /** 당일 성공 소비 횟수. 한도 하향 직후에는 limit을 초과할 수 있다(EC-Q-03) */
  used: number;
  limit: number;
  /** 다음 리셋 시각 ISO 8601(현재는 KST 자정). 주기 종류는 노출하지 않는다 — 월간 도입 시 스키마 불변 */
  resetAt: string;
  /** Redis 조회 성공 여부. false면 used는 의미 없는 0이며 "미사용"으로 렌더해선 안 된다 */
  isAvailable: boolean;
}

export type MeQuotaResponse = MeQuotaItem[];
