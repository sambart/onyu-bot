import globals from 'globals';

import {
  baseConfig,
  baseIgnores,
  hygieneRuleBlocks,
  i18nRuleBlocks,
  typeCheckedRules,
} from '../../eslint.config.base.mjs';

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
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // 로케일 tier 재유입 방지(F-GENERAL-007) — shared 는 R1~R3 만(사용자 노출 디렉터리 없음)
  ...i18nRuleBlocks({ sourceFiles: ['src/**/*.ts'] }),

  // 패턴 위생 — A3(사유 없는 eslint-disable · 조용한 .catch)은 소스 정리 완료, A4(타입 단언 사유)는 eslint-suppressions.json 베이스라인(신규 위반은 즉시 error)
  ...hygieneRuleBlocks({ sourceFiles: ['src/**/*.ts'] }),
];
