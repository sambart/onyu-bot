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
 * 로케일 목록은 `TIER1_LOCALES`/`TIER2_LOCALES`(`@onyu/shared`)에서 파생한다 — 하드코딩하지 않는다.
 * 언어가 추가되면 이 spec 은 수정 없이 자동으로 그 언어를 커버 범위에 포함한다. 비교 축은
 * "기준 로케일(`DEFAULT_LOCALE`) 대비 각 로케일"이라 N 로케일에서도 검사 비용이 O(N) 이다.
 *
 * tier 정책(F-GENERAL-007):
 * - 1군: 파일 집합·키 집합·플레이스홀더 모두 엄격 일치(누락/과잉 = 실패).
 * - 2군: 디렉토리·파일 부재 허용, 기준 대비 누락 키는 `console.warn` 리포트만,
 *   과잉 키와 존재하는 키의 플레이스홀더 불일치는 실패(오타·삭제 키 잔재 방지).
 */
import { DEFAULT_LOCALE, TIER1_LOCALES, TIER2_LOCALES } from '@onyu/shared';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// bot-i18n.service.ts의 resolveLocalesRoot() 최후 폴백과 동일한 상대 경로(소스 레이아웃 기준).
// 이 spec 파일이 bot-i18n.service.ts와 같은 디렉토리에 위치하므로 경로 깊이가 동일하다.
const LOCALES_ROOT = path.resolve(__dirname, '../../../../../libs/i18n/locales');

// bot-i18n.service.ts BOT_NAMESPACES와 동기화 — 드리프트(신규 네임스페이스 파일 추가 후 서비스 배선 누락) 감지용.
// 로케일 목록과 달리 이 목록은 파생하지 않고 유지한다 — bot-i18n.service.ts 의
// BOT_NAMESPACES 와의 수동 동기화 감지가 목적이라, 자동 파생하면 검사 의미가 사라진다.
const EXPECTED_BOT_NAMESPACES = ['commands', 'voice', 'newbie', 'inactive', 'errors', 'role-panel'];

// 비교 축은 "기준 로케일 대비 각 로케일". 기준 로케일 자신은 비교에서 제외한다.
const OTHER_TIER1_LOCALES = TIER1_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

/** 누락 리포트에 노출할 상위 키 개수(로그 폭주 방지). */
const REPORT_SAMPLE_KEY_LIMIT = 10;

/** 2군 패리티 실패 시 안내 — en 에서 키가 삭제·플레이스홀더 변경된 경우 오프라인 정리 명령으로 해소한다. */
const TIER2_PRUNE_HINT =
  '\n안내: en 에서 키를 삭제하거나 플레이스홀더를 바꿨다면 `pnpm --filter @onyu/api i18n:prune` 을 실행한 뒤 커밋하세요.';

type LocaleMessages = Record<string, string>;
type LocaleTier = 'tier1' | 'tier2';

interface ParityResult {
  /** 실패로 취급하는 위반 목록(빈 배열이어야 통과). */
  failures: string[];
  /** 2군 한정 — 기준 대비 누락 키(리포트만, 실패 아님). */
  missingKeys: string[];
}

interface ParityParams {
  root: string;
  base: string;
  locale: string;
  tier: LocaleTier;
  namespaces: readonly string[];
}

function readNamespaceFiles(root: string, locale: string): string[] {
  const dir = path.join(root, locale, 'bot');
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

function loadNamespace(root: string, locale: string, ns: string): LocaleMessages {
  const filePath = path.join(root, locale, 'bot', `${ns}.json`);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as LocaleMessages;
}

/** 문자열 내 `{변수}` 보간 토큰 집합을 추출한다(BotI18nService.interpolate와 동일한 정규식). */
function extractPlaceholders(template: string): Set<string> {
  const matches = template.matchAll(/\{(\w+)\}/g);
  return new Set(Array.from(matches, (m) => m[1]));
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((v) => b.has(v));
}

/** tier 정책에 맞춰 네임스페이스 파일 집합을 검사한다(1군: 정확 일치, 2군: 정의 밖 파일만 금지). */
function checkFileSet(p: ParityParams, files: string[]): string[] {
  const { locale, tier, namespaces } = p;
  if (tier === 'tier1') {
    const expectedFiles = [...namespaces].sort();
    return JSON.stringify(files) === JSON.stringify(expectedFiles)
      ? []
      : [`${locale} 네임스페이스 파일 목록 불일치: [${files}] != [${expectedFiles}]`];
  }
  return files
    .filter((f) => !namespaces.includes(f))
    .map((file) => `${locale} 에 정의되지 않은 네임스페이스 파일: ${file}.json`);
}

/** 한 네임스페이스의 키 집합·플레이스홀더를 기준과 비교한다. */
function compareNamespace(p: ParityParams, ns: string): ParityResult {
  const { root, base, locale, tier } = p;
  const baseMessages = loadNamespace(root, base, ns);
  const otherMessages = loadNamespace(root, locale, ns);
  const failures = Object.keys(otherMessages)
    .filter((key) => !(key in baseMessages))
    .map((key) => `${ns}.${key}: ${locale} 에만 있는 과잉 키`);
  const missing = Object.keys(baseMessages).filter((key) => !(key in otherMessages));

  for (const key of Object.keys(baseMessages).filter((k) => k in otherMessages)) {
    const basePlaceholders = extractPlaceholders(baseMessages[key]);
    const otherPlaceholders = extractPlaceholders(otherMessages[key]);
    if (!sameSet(basePlaceholders, otherPlaceholders)) {
      failures.push(
        `${ns}.${key}: ${locale} 보간 변수(${[...otherPlaceholders].join(',')})가 ` +
          `${base}(${[...basePlaceholders].join(',')})과 다릅니다`,
      );
    }
  }
  if (tier === 'tier1') {
    failures.push(...missing.map((key) => `${ns}.${key}: ${locale} 누락 키`));
    return { failures, missingKeys: [] };
  }
  return { failures, missingKeys: missing.map((key) => `${ns}.${key}`) };
}

/** 한 로케일을 기준 로케일과 비교해 tier 정책에 맞는 위반·누락을 수집한다. */
function checkLocaleParity(params: ParityParams): ParityResult {
  const { root, base, locale, tier, namespaces } = params;
  const files = readNamespaceFiles(root, locale);
  const failures = checkFileSet(params, files);
  const missingKeys: string[] = [];

  for (const ns of namespaces) {
    if (files.includes(ns)) {
      const result = compareNamespace(params, ns);
      failures.push(...result.failures);
      missingKeys.push(...result.missingKeys);
    } else if (tier === 'tier2') {
      // 2군 파일 부재는 허용 — 기준의 전 키가 누락이다(1군은 파일 집합 검사가 이미 실패 처리).
      const baseMessages = loadNamespace(root, base, ns);
      missingKeys.push(...Object.keys(baseMessages).map((key) => `${ns}.${key}`));
    }
  }
  return { failures, missingKeys };
}

function reportMissingKeys(locale: string, missingKeys: string[]): void {
  if (missingKeys.length === 0) {
    return;
  }
  console.warn(
    `[i18n 2군 누락 리포트] ${locale}: 누락 키 ${missingKeys.length}개 (en 폴백) — 상위 ` +
      `${Math.min(REPORT_SAMPLE_KEY_LIMIT, missingKeys.length)}개: ` +
      missingKeys.slice(0, REPORT_SAMPLE_KEY_LIMIT).join(', '),
  );
}

describe('봇 i18n 로케일 파일 무결성 (tier 별 패리티)', () => {
  it('1군 로케일의 bot 네임스페이스 파일 목록이 BOT_NAMESPACES 상수와 동기화되어 있다', () => {
    for (const locale of TIER1_LOCALES) {
      expect(readNamespaceFiles(LOCALES_ROOT, locale), `${locale} 네임스페이스 파일 목록`).toEqual(
        [...EXPECTED_BOT_NAMESPACES].sort(),
      );
    }
  });

  it('1군 로케일이 기준 로케일과 파일·키·플레이스홀더에서 엄격히 일치한다', () => {
    for (const locale of OTHER_TIER1_LOCALES) {
      const { failures } = checkLocaleParity({
        root: LOCALES_ROOT,
        base: DEFAULT_LOCALE,
        locale,
        tier: 'tier1',
        namespaces: EXPECTED_BOT_NAMESPACES,
      });
      expect(failures, `${locale} 패리티 위반`).toEqual([]);
    }
  });

  it('2군 로케일은 과잉 키·플레이스홀더 불일치가 없다(누락 키는 리포트만)', () => {
    for (const locale of TIER2_LOCALES as readonly string[]) {
      const { failures, missingKeys } = checkLocaleParity({
        root: LOCALES_ROOT,
        base: DEFAULT_LOCALE,
        locale,
        tier: 'tier2',
        namespaces: EXPECTED_BOT_NAMESPACES,
      });
      reportMissingKeys(locale, missingKeys);
      expect(failures, `${locale}(2군) 패리티 위반${TIER2_PRUNE_HINT}`).toEqual([]);
    }
  });

  it('errors/commands/newbie/voice 네임스페이스는 빈 객체가 아니다(migration 이후 채워짐)', () => {
    for (const ns of ['errors', 'commands', 'newbie', 'voice']) {
      const base = loadNamespace(LOCALES_ROOT, DEFAULT_LOCALE, ns);
      expect(
        Object.keys(base).length,
        `${ns}.json(${DEFAULT_LOCALE})가 비어 있습니다`,
      ).toBeGreaterThan(0);
    }
  });

  it('inactive 네임스페이스는 1군에서 명시적으로 빈 객체로 유지된다(봇 노출 문자열 없음)', () => {
    for (const locale of TIER1_LOCALES) {
      expect(loadNamespace(LOCALES_ROOT, locale, 'inactive')).toEqual({});
    }
  });
});

/** 가짜 로케일 픽스처 데이터 — 로케일명 → bot/a.json 내용. */
const FIXTURE_LOCALES: Record<string, LocaleMessages> = {
  en: { greet: 'Hi {name}', bye: 'Bye' },
  ko: { greet: '안녕 {name}', bye: '잘가' },
  kmiss: { greet: '안녕 {name}' }, // 1군인데 키 누락
  xx: { greet: 'Oi {name}' }, // 2군 — bye 누락(허용)
  yy: { greet: 'Oi {nome}', bye: 'Tchau' }, // 2군 — 플레이스홀더 불일치
  zz: { greet: 'Oi {name}', extra: 'x' }, // 2군 — 과잉 키
};

function createFixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onyu-i18n-parity-'));
  for (const [locale, content] of Object.entries(FIXTURE_LOCALES)) {
    const dir = path.join(root, locale, 'bot');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(content), 'utf-8');
  }
  return root;
}

describe('checkLocaleParity — 가짜 로케일 픽스처로 tier 동작 검증', () => {
  let root = '';

  function check(locale: string, tier: LocaleTier): ParityResult {
    return checkLocaleParity({ root, base: 'en', locale, tier, namespaces: ['a'] });
  }

  beforeAll(() => {
    root = createFixtureRoot();
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('1군: 완전한 로케일은 통과한다', () => {
    expect(check('ko', 'tier1').failures).toEqual([]);
  });

  it('1군: 키 누락은 실패한다', () => {
    expect(check('kmiss', 'tier1').failures).toEqual(['a.bye: kmiss 누락 키']);
  });

  it('1군: 로케일 디렉토리 부재는 실패한다', () => {
    expect(check('absent', 'tier1').failures.length).toBeGreaterThan(0);
  });

  it('2군: 누락 키 는 실패하지 않고 리포트 대상으로만 수집된다', () => {
    const result = check('xx', 'tier2');
    expect(result.failures).toEqual([]);
    expect(result.missingKeys).toEqual(['a.bye']);
  });

  it('2군: 디렉토리 부재는 허용하고 기준의 전 키 를 누락으로 수집한다', () => {
    const result = check('absent', 'tier2');
    expect(result.failures).toEqual([]);
    expect(result.missingKeys).toEqual(['a.greet', 'a.bye']);
  });

  it('2군: 플레이스홀더 불일치는 실패한다', () => {
    expect(check('yy', 'tier2').failures).toHaveLength(1);
  });

  it('2군: 기준에 없는 과잉 키 는 실패한다', () => {
    expect(check('zz', 'tier2').failures).toEqual(['a.extra: zz 에만 있는 과잉 키']);
  });
});
