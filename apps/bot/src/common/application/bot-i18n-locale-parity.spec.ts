/**
 * 봇 i18n 로케일 파일 무결성(패리티) 테스트.
 *
 * `libs/i18n/locales/{ko,en}/bot/*.json` 은 BotI18nService가 부팅 시 그대로 로딩한다(런타임 검증 없음).
 * 한쪽 로케일에만 키를 추가/삭제하거나 `{변수}` 보간 플레이스홀더가 어긋나면, 그 시점에는
 * 아무 에러도 나지 않고 조용히 "키 원문 노출"(BotI18nService.t 폴백: locale→en→key 그대로) 또는
 * "보간 누락"(치환되지 않은 `{foo}` 리터럴 노출)으로 이어진다. 본 테스트는 그 회귀를 구조적으로 방지한다.
 *
 * 개별 문자열 값을 스냅샷하지 않는다(과잉 테스트 방지) — 오직 (1) 네임스페이스 파일 존재 집합,
 * (2) 키 집합, (3) `{변수}` 보간 플레이스홀더 집합의 로케일 간 동등성만 검증한다.
 *
 * 로케일 목록은 `SUPPORTED_LOCALES`(`@onyu/shared`)에서 파생한다 — 하드코딩하지 않는다.
 * 언어가 추가되면 이 spec 은 수정 없이 자동으로 그 언어를 커버 범위에 포함한다. 비교 축은
 * "기준 로케일(`DEFAULT_LOCALE`) 대비 각 로케일"이라 N 로케일에서도 검사 비용이 O(N) 이다.
 */
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@onyu/shared';
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

// bot-i18n.service.ts의 resolveLocalesRoot() 최후 폴백과 동일한 상대 경로(소스 레이아웃 기준).
// 이 spec 파일이 bot-i18n.service.ts와 같은 디렉토리에 위치하므로 경로 깊이가 동일하다.
const LOCALES_ROOT = path.resolve(__dirname, '../../../../../libs/i18n/locales');

// bot-i18n.service.ts BOT_NAMESPACES와 동기화 — 드리프트(신규 네임스페이스 파일 추가 후 서비스 배선 누락) 감지용.
// SUPPORTED_LOCALES 와 달리 이 목록은 파생하지 않고 유지한다 — bot-i18n.service.ts 의
// BOT_NAMESPACES 와의 수동 동기화 감지가 목적이라, 자동 파생하면 검사 의미가 사라진다.
const EXPECTED_BOT_NAMESPACES = ['commands', 'voice', 'newbie', 'inactive', 'errors', 'role-panel'];

// 로케일 목록은 하드코딩하지 않고 SUPPORTED_LOCALES 에서 파생한다 — 언어 추가 시 이 spec 이
// 수정 없이 자동으로 커버 범위에 포함되도록 한다(plan §6-4). 비교 축은 "기준 로케일 대비 각 로케일".
const OTHER_LOCALES = SUPPORTED_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

type LocaleMessages = Record<string, string>;

function readNamespaceFiles(locale: string): string[] {
  const dir = path.join(LOCALES_ROOT, locale, 'bot');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

function loadNamespace(locale: string, ns: string): LocaleMessages {
  const filePath = path.join(LOCALES_ROOT, locale, 'bot', `${ns}.json`);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as LocaleMessages;
}

/** 문자열 내 `{변수}` 보간 토큰 집합을 추출한다(BotI18nService.interpolate와 동일한 정규식). */
function extractPlaceholders(template: string): Set<string> {
  const matches = template.matchAll(/\{(\w+)\}/g);
  return new Set(Array.from(matches, (m) => m[1]));
}

describe('봇 i18n 로케일 파일 무결성 (전 로케일 패리티)', () => {
  it('bot 네임스페이스 파일 목록이 모든 로케일에서 BOT_NAMESPACES 상수와 동기화되어 있다', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(readNamespaceFiles(locale), `${locale} 네임스페이스 파일 목록`).toEqual(
        [...EXPECTED_BOT_NAMESPACES].sort(),
      );
    }
  });

  describe.each(EXPECTED_BOT_NAMESPACES)('%s 네임스페이스', (ns) => {
    const baseMessages = loadNamespace(DEFAULT_LOCALE, ns);
    const baseKeys = Object.keys(baseMessages).sort();

    it.each(OTHER_LOCALES)(
      `키 집합이 기준 로케일(${DEFAULT_LOCALE})과 %s 에서 동일하다(누락/과잉 키 없음)`,
      (locale) => {
        const otherKeys = Object.keys(loadNamespace(locale, ns)).sort();
        expect(otherKeys).toEqual(baseKeys);
      },
    );

    it.each(OTHER_LOCALES)(
      `{변수} 보간 플레이스홀더 집합이 키별로 기준 로케일(${DEFAULT_LOCALE})과 %s 에서 동일하다`,
      (locale) => {
        const otherMessages = loadNamespace(locale, ns);

        for (const key of baseKeys) {
          const basePlaceholders = extractPlaceholders(baseMessages[key]);
          const otherPlaceholders = extractPlaceholders(otherMessages[key] ?? '');

          expect(
            [...otherPlaceholders].sort(),
            `키 "${ns}.${key}"의 ${locale} 보간 변수(${[...otherPlaceholders].join(',')})가 ` +
              `${DEFAULT_LOCALE}(${[...basePlaceholders].join(',')})과 다릅니다`,
          ).toEqual([...basePlaceholders].sort());
        }
      },
    );
  });

  it('errors/commands/newbie/voice 네임스페이스는 빈 객체가 아니다(migration 이후 채워짐)', () => {
    for (const ns of ['errors', 'commands', 'newbie', 'voice']) {
      const base = loadNamespace(DEFAULT_LOCALE, ns);
      expect(
        Object.keys(base).length,
        `${ns}.json(${DEFAULT_LOCALE})가 비어 있습니다`,
      ).toBeGreaterThan(0);
    }
  });

  it('inactive 네임스페이스는 명시적으로 빈 객체로 유지된다(봇 노출 문자열 없음)', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(loadNamespace(locale, 'inactive')).toEqual({});
    }
  });
});
