/**
 * 봇 i18n 로케일 파일 무결성(패리티) 테스트.
 *
 * `libs/i18n/locales/{ko,en}/bot/*.json` 은 BotI18nService가 부팅 시 그대로 로딩한다(런타임 검증 없음).
 * 한쪽 로케일에만 키를 추가/삭제하거나 `{변수}` 보간 플레이스홀더가 어긋나면, 그 시점에는
 * 아무 에러도 나지 않고 조용히 "키 원문 노출"(BotI18nService.t 폴백: locale→en→key 그대로) 또는
 * "보간 누락"(치환되지 않은 `{foo}` 리터럴 노출)으로 이어진다. 본 테스트는 그 회귀를 구조적으로 방지한다.
 *
 * 개별 문자열 값을 스냅샷하지 않는다(과잉 테스트 방지) — 오직 (1) 네임스페이스 파일 존재 집합,
 * (2) 키 집합, (3) `{변수}` 보간 플레이스홀더 집합의 ko/en 동등성만 검증한다.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

// bot-i18n.service.ts의 resolveLocalesRoot() 최후 폴백과 동일한 상대 경로(소스 레이아웃 기준).
// 이 spec 파일이 bot-i18n.service.ts와 같은 디렉토리에 위치하므로 경로 깊이가 동일하다.
const LOCALES_ROOT = path.resolve(__dirname, '../../../../../libs/i18n/locales');

// bot-i18n.service.ts BOT_NAMESPACES와 동기화 — 드리프트(신규 네임스페이스 파일 추가 후 서비스 배선 누락) 감지용.
const EXPECTED_BOT_NAMESPACES = ['commands', 'voice', 'newbie', 'inactive', 'errors', 'role-panel'];

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

describe('봇 i18n 로케일 파일 무결성 (ko/en 패리티)', () => {
  it('bot 네임스페이스 파일 목록이 BOT_NAMESPACES 상수와 동기화되어 있다', () => {
    const koNamespaces = readNamespaceFiles('ko');
    const enNamespaces = readNamespaceFiles('en');

    expect(koNamespaces).toEqual([...EXPECTED_BOT_NAMESPACES].sort());
    expect(enNamespaces).toEqual([...EXPECTED_BOT_NAMESPACES].sort());
  });

  it.each(EXPECTED_BOT_NAMESPACES)(
    '%s 네임스페이스의 키 집합이 ko/en 동일하다(누락/과잉 키 없음)',
    (ns) => {
      const ko = loadNamespace('ko', ns);
      const en = loadNamespace('en', ns);

      const koKeys = Object.keys(ko).sort();
      const enKeys = Object.keys(en).sort();

      expect(koKeys).toEqual(enKeys);
    },
  );

  it.each(EXPECTED_BOT_NAMESPACES)(
    '%s 네임스페이스의 {변수} 보간 플레이스홀더 집합이 키별로 ko/en 동일하다',
    (ns) => {
      const ko = loadNamespace('ko', ns);
      const en = loadNamespace('en', ns);

      for (const key of Object.keys(ko)) {
        const koPlaceholders = extractPlaceholders(ko[key]);
        const enPlaceholders = extractPlaceholders(en[key] ?? '');

        expect(
          [...koPlaceholders].sort(),
          `키 "${ns}.${key}"의 ko 보간 변수(${[...koPlaceholders].join(',')})가 en(${[...enPlaceholders].join(',')})과 다릅니다`,
        ).toEqual([...enPlaceholders].sort());
      }
    },
  );

  it('errors/commands/newbie/voice 네임스페이스는 빈 객체가 아니다(migration 이후 채워짐)', () => {
    for (const ns of ['errors', 'commands', 'newbie', 'voice']) {
      const ko = loadNamespace('ko', ns);
      expect(Object.keys(ko).length, `${ns}.json(ko)가 비어 있습니다`).toBeGreaterThan(0);
    }
  });

  it('inactive 네임스페이스는 명시적으로 빈 객체로 유지된다(봇 노출 문자열 없음)', () => {
    const ko = loadNamespace('ko', 'inactive');
    const en = loadNamespace('en', 'inactive');

    expect(ko).toEqual({});
    expect(en).toEqual({});
  });
});
