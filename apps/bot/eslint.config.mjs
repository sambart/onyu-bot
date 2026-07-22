import globals from 'globals';

import { baseConfig, baseIgnores, typeCheckedRules } from '../../eslint.config.base.mjs';

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
];
