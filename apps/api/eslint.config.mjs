import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { policyRules } from '../../packages/config/eslint.base.mjs';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-spec/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      ...policyRules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  { files: ['test/**/*.ts', 'src/cli.ts', 'src/database/seeds/**/*.ts'], rules: { 'no-console': 'off' } },
);
