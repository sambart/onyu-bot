import type {
  ReportActionDefinition,
  ReportActionKey,
  ReportActionSurface,
} from '../types/report-pipeline';

/**
 * ⑤ 운영 액션 닫힌 카탈로그(F-GEMINI-037 — 리뷰 §5.5, D10 (b)).
 *
 * 리포트 결론을 기존 도메인 기능 화면으로 바로 연결한다. 실행(원클릭)은 하지 않는다 — 링크는 리포트를 보는
 * 사람과 같은 길드 관리자 화면으로만 간다(🔒 권한 확대 없음). 시그널 → 액션 매핑 규칙은 API
 * (`report-pipeline/report-action-mapper.ts`)에 있고, 여기는 "액션이 무엇이고 어디로 가는가"만 둔다.
 *
 * - 경로는 실재하는 App Router 페이지만 쓴다 — 웹 테스트(`report-action-routes.test.ts`)가 파일 존재를 고정한다.
 * - 키는 **추가만** 한다(의미 변경·삭제 금지).
 * - `premiumFeature` 는 전부 null — 연결 대상이 모두 무료 관리 화면이다(premium-policy §6.1). Pro 전용
 *   기능으로 가는 액션이 생기면 그 기능 키를 넣고, 렌더러가 잠금 배지로 표시한다.
 */
export const REPORT_ACTION_CATALOG: Readonly<Record<ReportActionKey, ReportActionDefinition>> = {
  'inactive-member.review': {
    key: 'inactive-member.review',
    domain: 'inactive-member',
    labelKey: 'diagnosis.aiInsight.actions.item.inactiveMemberReview',
    target: { kind: 'link', pathTemplate: '/dashboard/guild/{guildId}/inactive-member' },
    surfaces: ['web', 'discord'],
    requiredAccess: 'guild-admin',
    premiumFeature: null,
  },
  'newbie.configure': {
    key: 'newbie.configure',
    domain: 'newbie',
    labelKey: 'diagnosis.aiInsight.actions.item.newbieConfigure',
    target: { kind: 'link', pathTemplate: '/settings/guild/{guildId}/newbie' },
    surfaces: ['web', 'discord'],
    requiredAccess: 'guild-admin',
    premiumFeature: null,
  },
  'role-panel.configure': {
    key: 'role-panel.configure',
    domain: 'role-panel',
    labelKey: 'diagnosis.aiInsight.actions.item.rolePanelConfigure',
    target: { kind: 'link', pathTemplate: '/settings/guild/{guildId}/role-panel' },
    surfaces: ['web', 'discord'],
    requiredAccess: 'guild-admin',
    premiumFeature: null,
  },
  'auto-channel.configure': {
    key: 'auto-channel.configure',
    domain: 'auto-channel',
    labelKey: 'diagnosis.aiInsight.actions.item.autoChannelConfigure',
    target: { kind: 'link', pathTemplate: '/settings/guild/{guildId}/auto-channel' },
    surfaces: ['web', 'discord'],
    requiredAccess: 'guild-admin',
    premiumFeature: null,
  },
  'voice-dashboard.review': {
    key: 'voice-dashboard.review',
    domain: 'voice',
    labelKey: 'diagnosis.aiInsight.actions.item.voiceDashboardReview',
    target: { kind: 'link', pathTemplate: '/dashboard/guild/{guildId}/voice' },
    surfaces: ['web', 'discord'],
    requiredAccess: 'guild-admin',
    premiumFeature: null,
  },
  'admin-assist.ask': {
    key: 'admin-assist.ask',
    domain: 'admin-assist',
    labelKey: 'diagnosis.aiInsight.actions.item.adminAssistAsk',
    // 디스코드에는 패널이 없어 웹 전용이다
    target: { kind: 'admin-assist' },
    surfaces: ['web'],
    requiredAccess: 'guild-admin',
    premiumFeature: null,
  },
};

/** 표면별 액션 상한 — 웹 패널 버튼 · 주간 Embed 링크 버튼(ActionRow 5칸 − 기존 대시보드 버튼 1 − 여유 1) */
export const REPORT_ACTION_MAX_COUNT = 3;
/** limited 등급 상한(G2 "요약만" — 시그널 상한 1과 같다) */
export const REPORT_ACTION_MAX_COUNT_LIMITED = 1;

const GUILD_ID_PLACEHOLDER = '{guildId}';

/** 액션을 해당 표면에 그릴 수 있는지 */
export function isReportActionOnSurface(
  key: ReportActionKey,
  surface: ReportActionSurface,
): boolean {
  return REPORT_ACTION_CATALOG[key].surfaces.includes(surface);
}

/**
 * 링크 액션의 웹 경로(`/dashboard/guild/123/inactive-member`). 링크가 아닌 액션(admin-assist)은 null.
 * 호출자가 웹 origin 을 붙인다(디스코드 Embed — `WEB_URL`).
 */
export function buildReportActionPath(key: ReportActionKey, guildId: string): string | null {
  const { target } = REPORT_ACTION_CATALOG[key];
  if (target.kind !== 'link') return null;
  return target.pathTemplate.replace(GUILD_ID_PLACEHOLDER, encodeURIComponent(guildId));
}
