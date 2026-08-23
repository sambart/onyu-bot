import type { WeeklyReportConfigDto } from '../types/weekly-report';

/**
 * `weekly_report_config` 기본값 단일 정본. 엔티티 컬럼 default(`weekly-report-config.orm-entity.ts`)·
 * api 컨트롤러 폴백(`weekly-report.controller.ts`)·웹 폼 초기값(`lib/weekly-report-api.ts`)이
 * 모두 본 상수를 참조한다. 값은 기존 3소스와 동일 — 본 상수 신설은 기본값 변경이 아니다.
 *
 * `locale`은 2026-08-20 전역 기본 언어 en 전환에 맞춰 'en'으로 변경됐다. 기존
 * `weekly_report_config` 행(백필 'ko')은 변경하지 않는다 — 신규 길드부터만 적용된다.
 */
export const WEEKLY_REPORT_CONFIG_DEFAULTS = {
  isEnabled: false,
  channelId: null,
  dayOfWeek: 1,
  hour: 9,
  timezone: 'Asia/Seoul',
  locale: 'en',
} as const satisfies WeeklyReportConfigDto;

export type WeeklyReportConfigDefaults = typeof WEEKLY_REPORT_CONFIG_DEFAULTS;
