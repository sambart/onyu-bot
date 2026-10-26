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
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // 로케일 tier 재유입 방지(F-GENERAL-007) — shared 는 R1~R3 만(사용자 노출 디렉터리 없음)
  ...i18nRuleBlocks({ sourceFiles: ['src/**/*.ts'] }),
];
