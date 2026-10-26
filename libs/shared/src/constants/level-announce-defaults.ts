import { defineLocaleTable } from '../helpers/locale-table';
import type { SupportedLocale } from './locale';

interface LevelAnnounceStringTable {
  /** Embed 제목 */
  title: string;
  /** 기본 1줄 — 이번 레벨업 보상 역할 없음 */
  defaultLine: string;
  /** 기본 1줄 — 보상 역할 있음({role} 포함) */
  defaultLineWithRole: string;
  /** 4096 절단 접미사 — 내부 문자열이라 `{count}` 만 `interpolate()` 로 치환한다 */
  truncationSuffix: string;
}

/**
 * 레벨업 공지 기본 문구 (F-LVL-05 개정 · F-LVL-36). 2군(pt)은 작성하지 않아 en 으로 채워진다.
 * 🔒 ko `title`/`defaultLine`/`truncationSuffix` 는 개정 전 하드코딩 공지와 바이트 동일해야 한다(회귀 고정).
 */
export const LEVEL_ANNOUNCE_STRINGS = defineLocaleTable<LevelAnnounceStringTable>({
  ko: {
    title: '🎉 레벨업',
    defaultLine: '{user}님이 레벨 {level}에 도달했습니다!',
    defaultLineWithRole: '{user}님이 레벨 {level}에 도달했습니다! 🎁 {role}',
    truncationSuffix: '…외 {count}명 레벨업',
  },
  en: {
    title: '🎉 Level Up',
    defaultLine: '{user} reached level {level}!',
    defaultLineWithRole: '{user} reached level {level}! 🎁 {role}',
    truncationSuffix: '…and {count} more leveled up',
  },
});

/** 길드 언어 미설정 시 공지 언어 폴백 — 기존 한국어 하드코딩 공지와 호환 */
export const LEVEL_ANNOUNCE_LOCALE_FALLBACK: SupportedLocale = 'ko';
