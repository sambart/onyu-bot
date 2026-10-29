/**
 * pt 봇 JSON 완결성 가드 (docs/plans/i18n-pt-br-bot.md §2-10 · §6-3 완료 기준 2).
 *
 * 일반 2군 패리티(`bot-i18n-locale-parity.spec.ts`)는 "누락 키 = 리포트만"이라 pt 가 봇 표면 안에서
 * 빠짐없이 번역됐는지는 잡지 못한다. 이 spec 은 pt 에 한해 그 완료 기준을 고정한다.
 *
 * - 누락 키 집합이 정확히 관리도우미 표면 밖 키(`commands.adminAssist*`, 계획 §2-5 Q1)와 같다.
 *   그 외 키가 빠지면(번역 회귀) 이 spec 이 실패한다. 반대로 관리도우미 키가 pt 에 생기면(Q1 결정 위반) 실패한다.
 * - `inactive` 는 en 이 빈 객체라 pt 파일이 없다(계획 §0 ①).
 * - 법률 키(`privacy.`·`terms.`)는 봇 표면에 존재하지 않으며 pt 에도 없다(정책 `exclude.legal`).
 * - 웹 노출(`pt/web/` 배선·노출 가드)은 A7 이후 웹 spec(`web-locale-exposure.test.ts`)이 맡는다.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const LOCALES_ROOT = path.resolve(__dirname, '../../../../../libs/i18n/locales');
const BOT_NAMESPACES = ['commands', 'voice', 'newbie', 'inactive', 'errors', 'role-panel'] as const;
const ADMIN_ASSIST_KEY_PREFIX = 'adminAssist';
const ADMIN_ASSIST_NAMESPACE = 'commands';
const LEGAL_KEY_PREFIXES = ['privacy.', 'terms.'] as const;

/**
 * 1군(ko/en) 에만 추가되고 pt 번역이 아직 없는 키(2군 수동 작성 금지).
 * 번역 파이프라인 자동 PR 이 pt 를 채우면 해당 키를 여기서 제거한다.
 * (현재: 연말 결산 8키 — 번역 PR 머지 시 제거)
 */
const PT_PENDING_TRANSLATION_KEYS: readonly string[] = [
  // 연말 결산(`/me 보기:결산`) — pt 는 번역 파이프라인이 채운다(en 폴백 동작)
  'commands.meRecapButtonLabel',
  'commands.meRecapEmpty',
  'commands.meRecapEnded',
  'commands.meRecapError',
  'commands.meRecapNotStarted',
  'commands.meRecapSummaryHours',
  'commands.meRecapSummaryMessages',
  'commands.meRecapSummaryMinutes',
];

type Messages = Record<string, string>;

function load(locale: string, ns: string): Messages | null {
  const file = path.join(LOCALES_ROOT, locale, 'bot', `${ns}.json`);
  if (!fs.existsSync(file)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as Messages;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

function missingKeys(): string[] {
  const missing: string[] = [];
  for (const ns of BOT_NAMESPACES) {
    const en = load('en', ns) ?? {};
    const pt = load('pt', ns) ?? {};
    for (const key of Object.keys(en)) {
      if (!(key in pt)) {
        missing.push(`${ns}.${key}`);
      }
    }
  }
  return missing.sort();
}

describe('pt 봇 JSON 완결성', () => {
  it('en 대비 누락 키가 관리도우미 표면 밖 키(commands.adminAssist*) ∪ 번역 대기 키와 정확히 일치한다', () => {
    const enCommands = load('en', ADMIN_ASSIST_NAMESPACE) ?? {};
    const expected = Object.keys(enCommands)
      .filter((key) => key.startsWith(ADMIN_ASSIST_KEY_PREFIX))
      .map((key) => `${ADMIN_ASSIST_NAMESPACE}.${key}`)
      .sort();

    expect(expected).toHaveLength(17);
    expect(missingKeys()).toEqual([...expected, ...PT_PENDING_TRANSLATION_KEYS].sort());
  });

  it('pt 에 관리도우미 키(adminAssist*)가 없다 — 정적 문구는 en 폴백(Q1)', () => {
    const ptCommands = load('pt', ADMIN_ASSIST_NAMESPACE) ?? {};

    expect(
      Object.keys(ptCommands).filter((key) => key.startsWith(ADMIN_ASSIST_KEY_PREFIX)),
    ).toEqual([]);
  });

  it('번역 대상 129키가 모두 번역돼 있다(en 146키 − 관리도우미 17키 − 번역 대기 0키)', () => {
    const translatedCount = BOT_NAMESPACES.reduce(
      (sum, ns) => sum + Object.keys(load('pt', ns) ?? {}).length,
      0,
    );

    expect(translatedCount).toBe(129);
  });

  it('pt 에 en 에 없는 과잉 키가 없다', () => {
    const excess: string[] = [];
    for (const ns of BOT_NAMESPACES) {
      const en = load('en', ns) ?? {};
      for (const key of Object.keys(load('pt', ns) ?? {})) {
        if (!(key in en)) {
          excess.push(`${ns}.${key}`);
        }
      }
    }

    expect(excess).toEqual([]);
  });

  it('pt 의 모든 값은 비어 있지 않고, 보간 플레이스홀더 집합이 en 과 같다', () => {
    const violations: string[] = [];
    for (const ns of BOT_NAMESPACES) {
      const en = load('en', ns) ?? {};
      const pt = load('pt', ns) ?? {};
      for (const [key, value] of Object.entries(pt)) {
        if (typeof value !== 'string' || value.trim() === '') {
          violations.push(`${ns}.${key}: 빈 값`);
          continue;
        }
        if (JSON.stringify(placeholders(value)) !== JSON.stringify(placeholders(en[key] ?? ''))) {
          violations.push(`${ns}.${key}: 플레이스홀더 불일치`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('inactive 네임스페이스는 en 이 비어 있어 pt 파일이 없다', () => {
    expect(load('en', 'inactive')).toEqual({});
    expect(load('pt', 'inactive')).toBeNull();
  });

  it('법률 키(privacy.·terms.)가 pt 봇 JSON 에 없다', () => {
    const legalKeys: string[] = [];
    for (const ns of BOT_NAMESPACES) {
      for (const key of Object.keys(load('pt', ns) ?? {})) {
        if (LEGAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          legalKeys.push(`${ns}.${key}`);
        }
      }
    }

    expect(legalKeys).toEqual([]);
  });
});
