import type { WeeklyReportConfigDto } from '../types/weekly-report';

/**
 * `weekly_report_config` 기본값 단일 정본. 엔티티 컬럼 default(`weekly-report-config.orm-entity.ts`)·
 * api 컨트롤러 폴백(`weekly-report.controller.ts`)·웹 폼 초기값(`lib/weekly-report-api.ts`)이
 * 모두 본 상수를 참조한다. 값은 기존 3소스와 동일 — 본 상수 신설은 기본값 변경이 아니다.
 */
export const WEEKLY_REPORT_CONFIG_DEFAULTS = {
  isEnabled: false,
  channelId: null,
  dayOfWeek: 1,
  hour: 9,
  timezone: 'Asia/Seoul',
  locale: 'ko',
} as const satisfies WeeklyReportConfigDto;

export type WeeklyReportConfigDefaults = typeof WEEKLY_REPORT_CONFIG_DEFAULTS;
