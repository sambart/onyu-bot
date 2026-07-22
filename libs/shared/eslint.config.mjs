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
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
