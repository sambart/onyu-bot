import globals from 'globals';

import {
  baseConfig,
  baseIgnores,
  hygieneRuleBlocks,
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
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
    },
  },

  // 패턴 위생 — A3(사유 없는 eslint-disable · 조용한 .catch)은 소스 정리 완료, A4(타입 단언 사유)는 eslint-suppressions.json 베이스라인(신규 위반은 즉시 error)
  ...hygieneRuleBlocks({ sourceFiles: ['src/**/*.ts'] }),
];
