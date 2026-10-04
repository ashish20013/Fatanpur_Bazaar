// Shared ESLint flat-config fragments. Each app composes these with its own parser setup.
// Rules here encode project policy (see docs/SECURITY_AUDIT.md), not style preferences.
export const policyRules = {
  // `any` hides bugs in money/permission code — banned (docs §18).
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true, allowTypedFunctionExpressions: true }],
  'no-empty': ['error', { allowEmptyCatch: false }],
  // Math.random is never acceptable for OTP / tokens / codes (SECURITY_AUDIT §2).
  'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use crypto.randomInt / randomBytes' }],
  'no-restricted-globals': ['error', { name: 'localStorage', message: 'Tokens never go to localStorage (SECURITY_AUDIT §2). Use cookies or in-memory state.' }],
  eqeqeq: ['error', 'always'],
  'no-console': ['warn', { allow: ['warn', 'error'] }],
};
