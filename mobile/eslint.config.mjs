import { defineConfig, globalIgnores } from 'eslint/config';
import expo from 'eslint-config-expo/flat.js';

export default defineConfig([
  expo,
  globalIgnores(['dist/**', '.expo/**', 'ios/**', 'android/**', 'coverage/**', 'build/**']),
  {
    files: ['*.cjs'],
    languageOptions: {
      globals: { __dirname: 'readonly', require: 'readonly', module: 'readonly' },
    },
  },
  {
    files: ['**/*.{ts,tsx,mts}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
]);
