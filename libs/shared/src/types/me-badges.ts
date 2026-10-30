/**
 * `POST /bot-api/me/badges` 응답 — API 컨트롤러와 bot-api-client 가 같은 타입을 쓴다(수기 SDK 드리프트 방지).
 * 항상 HTTP 200 이며 실패는 `ok:false` 로 표현한다(봇이 ephemeral 안내로 분기).
 */
export type MeBadgesBotResponse =
  | { ok: true; data: { imageBase64: string } }
  | { ok: false; data: null };
