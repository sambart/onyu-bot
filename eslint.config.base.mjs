import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

import { ONYU_DISCORD_PLUGIN_NAME, onyuDiscordPlugin } from './eslint.discord-rules.mjs';
import { ONYU_I18N_PLUGIN_NAME, onyuI18nPlugin } from './eslint.i18n-rules.mjs';

/** Base ESLint flat config shared across all workspaces. */
export const baseConfig = [
  ...tseslint.configs.recommended,

  eslintConfigPrettier,

  {
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-throw-literal': 'error',
      'no-else-return': ['error', { allowElseIf: false }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      // Constructor DI(NestJS) false positive 가독성 영향 작아 off — 일반 함수 과인자는 리뷰로 확인
      'no-negated-condition': 'off',
      'no-warning-comments': [
        'warn',
        { terms: ['todo', 'fixme', 'xxx'], location: 'start' },
      ],
      // NestJS Constructor DI 는 보통 4~5개 — false positive 완화 (5 초과는 책임 과다 신호로 유지)
      'max-params': ['warn', { max: 5 }],
      'max-lines-per-function': [
        'warn',
        { max: 50, skipBlankLines: true, skipComments: true },
      ],
      'no-magic-numbers': [
        'warn',
        {
          ignore: [
            -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 30, 60, 100, 1000, 1024, 3600,
            // 일반 리터럴 (시간 단위/퍼센트 경계 등 빈출)
            9, 14, 15, 20, 25, 32, 40, 50, 90,
            // HTTP 상태코드 + 캘린더(일/년)
            200, 204, 300, 365, 404, 500,
            // 포트 번호
            3000, 5432, 6379,
            // 시간(초/밀리초)
            60_000, 86_400, 86_400_000,
          ],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreEnums: true,
          ignoreReadonlyClassProperties: true,
          enforceConst: true,
        },
      ],
      'max-depth': ['error', { max: 3 }],
    },
  },
];

/** Type-checked rules — requires parserOptions.project in consuming config. */
export const typeCheckedRules = {
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/return-await': ['error', 'in-try-catch'],
  '@typescript-eslint/prefer-optional-chain': 'error',
  '@typescript-eslint/prefer-nullish-coalescing': 'error',
};

/** Standard ignore patterns shared across workspaces. */
export const baseIgnores = ['dist/**', 'node_modules/**', 'coverage/**', '*.js', '*.d.ts'];

// ---------------------------------------------------------------------------
// 로케일 tier 재유입 방지 규칙 (F-GENERAL-007, docs/plans/i18n-locale-tiering-generalization.md §3 S6)
// ---------------------------------------------------------------------------

/** 로케일 규칙에서 제외하는 테스트·스크립트 파일 (앱 cwd 기준 glob — 앱 lint 와 lint-staged 모두 앱 cwd 로 실행한다). */
const I18N_TEST_IGNORES = [
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*-spec.ts',
  '**/__tests__/**',
  '**/test/**',
  '**/scripts/**',
];

/** 로케일 정본 정의 파일 — 리터럴 로케일 목록/테이블을 정의하는 곳이라 R1~R3 대상이 아니다. */
const I18N_CANONICAL_FILES = ['**/constants/locale.ts', '**/helpers/locale-table.ts'];

const I18N_PLUGINS = { [ONYU_I18N_PLUGIN_NAME]: onyuI18nPlugin };

/**
 * 로케일 tier 규칙 블록을 만든다.
 * @param {object} scope
 * @param {string[]} scope.sourceFiles R1~R3 대상 glob
 * @param {string[]} [scope.tableAllowlist] R3 예외 파일(PublicLocale 엄격 테이블·공개 콘텐츠 hreflang — A8 까지)
 * @param {string[]} [scope.hangulFiles] R4(하드코딩 한글) 대상 glob — 없으면 R4 비활성
 * @param {string[]} [scope.hangulIgnores] R4 제외 glob
 */
export function i18nRuleBlocks({ sourceFiles, tableAllowlist = [], hangulFiles = [], hangulIgnores = [] }) {
  const blocks = [
    {
      files: sourceFiles,
      ignores: [...I18N_TEST_IGNORES, ...I18N_CANONICAL_FILES],
      plugins: I18N_PLUGINS,
      rules: {
        'onyu-i18n/no-locale-literal-branch': 'error',
        'onyu-i18n/no-locale-literal-set': 'error',
        'onyu-i18n/locale-table-via-helper': 'error',
      },
    },
  ];
  if (tableAllowlist.length > 0) {
    blocks.push({
      files: tableAllowlist,
      plugins: I18N_PLUGINS,
      rules: { 'onyu-i18n/locale-table-via-helper': 'off' },
    });
  }
  if (hangulFiles.length > 0) {
    blocks.push({
      files: hangulFiles,
      ignores: [...I18N_TEST_IGNORES, ...hangulIgnores],
      plugins: I18N_PLUGINS,
      rules: { 'onyu-i18n/no-hardcoded-hangul': 'error' },
    });
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// 길드 채널 게시 소속 검증 강제 규칙 (채널 ID 길드 간 게시 감사 A8 — PR #820 후속)
// ---------------------------------------------------------------------------

/**
 * 채널 소속 검증 없는 Discord 게시 sink 호출 금지 규칙 블록을 만든다.
 * 규칙 구현·판정 휴리스틱: 루트 `eslint.discord-rules.mjs`.
 * @param {object} scope
 * @param {string[]} scope.sourceFiles 대상 glob (앱 cwd 기준)
 * @param {string[]} [scope.ignores] 제외 glob — 검증 헬퍼 자체·REST 어댑터 정의 파일 등
 */
export function channelSendRuleBlocks({ sourceFiles, ignores = [] }) {
  return [
    {
      files: sourceFiles,
      ignores: [...I18N_TEST_IGNORES, ...ignores],
      plugins: { [ONYU_DISCORD_PLUGIN_NAME]: onyuDiscordPlugin },
      rules: { 'onyu-discord/guild-channel-send-requires-ownership-check': 'error' },
    },
  ];
}
