/** Bot → API 커맨드 사용 수집 payload — 유저 ID·인자 미포함 (개인 미식별 🔒) */
export interface CommandUsedDto {
  guildId: string;
  commandName: string;
  locale: string;
}

/** Web(api route) → API 페이지뷰 수집 payload — 방문자 미식별 🔒 (path 는 route 에서 정규화 완료) */
export interface PageViewDto {
  path: string;
  country: string; // 현재 항상 'XX' (F-USAGE-008)
}
