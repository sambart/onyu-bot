/** E1(exchange) · E2(refresh) 공통 응답 — API 발급 / Web 소비 계약 */
export interface AuthTokenPair {
  /** access JWT (1h) */
  token: string;
  /** 불투명 refresh 토큰 (12h) */
  refreshToken: string;
}

/** POST /auth/access-token 응답 — 회전 없는(비소모) access 전용 재발급 계약 */
export interface AccessTokenPayload {
  /** access JWT (1h) */
  token: string;
}
