/**
 * U9a-2 — 어드민 콘솔 확장(감사 로그 뷰어 · 기능 사용량 대시보드 · 헬스 스냅샷) 조회 뷰 타입.
 * `admin.ts`(AdminRole/AdminScope)와 분리한 신규 파일 — 조회 응답 셰이프 전용.
 */

// ── 감사 로그 뷰 (F-SUPER-ADMIN-010) ──

export interface AuditLogView {
  id: string;
  adminDiscordUserId: string;
  guildId: string | null;
  httpMethod: string;
  requestPath: string;
  createdAt: string; // ISO8601
}

export interface AuditLogListResponse {
  logs: AuditLogView[];
  nextCursor: string | null;
}

// ── 사용량 요약 (F-SUPER-ADMIN-012) ──

export interface GuildUsageRow {
  guildId: string;
  commandCount: number;
  aiCallCount: number;
  voiceMinutes: number;
  messageCount: number;
}

export interface PlatformPageView {
  path: string;
  count: number;
}

export interface UsageSummaryResponse {
  guilds: GuildUsageRow[];
  platformPageViews: PlatformPageView[];
}

// ── 길드 상세 (F-SUPER-ADMIN-013) ──

export interface CommandUsageDist {
  commandName: string;
  locale: string;
  count: number;
}

export interface AiUsageDist {
  scope: string;
  count: number;
}

export interface GuildUsageDetailResponse {
  guildId: string;
  commandUsage: CommandUsageDist[];
  aiUsage: AiUsageDist[];
  voiceMinutes: number;
  messageCount: number;
}

// ── 어드민 헬스 (F-SUPER-ADMIN-017) ──

export interface BotHealthSnapshot {
  gatewayPing: number;
  guildCount: number;
  voiceUsersTotal: number;
  uptimeSeconds: number;
}

export interface AdminHealthResponse {
  indicators: Record<string, 'up' | 'down'>; // api/db/redis/discord
  botSnapshot: BotHealthSnapshot | null; // 부재 시 null (degrade, R1)
}
