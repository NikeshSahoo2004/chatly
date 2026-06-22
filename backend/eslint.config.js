const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  // Global ignores (replaces .eslintignore)
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'jest.config.js'
    ],
  },
  // Base ESLint recommended rules
  eslint.configs.recommended,
  // TypeScript recommended rules
  ...tseslint.configs.recommended,
  // Custom rule overrides
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
      'no-console': 'off', // backend logging is expected
    },
  }
);

export default [
  {
    ignores: ["dist/", "build/", ".env", "coverage/"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  eslintConfigPrettier, // 2. Add it at the end of the array
];