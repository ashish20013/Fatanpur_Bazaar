// import { FlatCompat } from '@eslint/eslintrc';
// import path from 'path';
// import { fileURLToPath } from 'url';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const compat = new FlatCompat({ baseDirectory: __dirname });

// export default [
//   { ignores: ['.next/**', 'node_modules/**', 'playwright-report/**'] },
//   ...compat.extends('next/core-web-vitals'),
// ];
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'playwright-report/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
