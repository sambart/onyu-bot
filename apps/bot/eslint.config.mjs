import globals from 'globals';

import { baseConfig, baseIgnores, i18nRuleBlocks, typeCheckedRules } from '../../eslint.config.base.mjs';

export default [
  { ignores: baseIgnores },

  ...baseConfig,

  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    rules: {
      ...typeCheckedRules,
      // strictNullChecks: false 이므로 비활성화 — strictNullChecks 활성화 후 제거
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // 로케일 tier 재유입 방지(F-GENERAL-007) — R4 는 사용자 노출 디렉터리 한정, 기존 위반 백로그는 소진되어 suppressions 파일 없음(신규 위반은 즉시 error)
  ...i18nRuleBlocks({
    sourceFiles: ['src/**/*.ts'],
    hangulFiles: ['src/command/**/*.ts', 'src/event/**/*.ts'],
  }),
];
