import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const restrictedImports = {
  paths: ['@chakra-ui/icons', 'next/router', 'lodash', 'moment', 'axios'],
  patterns: ['lodash/*'],
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
    '.tmp/**',
    'playwright-report/**',
    'test-results/**',
    'blob-report/**',
  ]),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-imports': ['error', restrictedImports],
    },
  },
  {
    files: ['lib/render/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...restrictedImports.paths,
            'react',
            'react-dom',
            'next',
            'fs',
            'path',
            'sharp',
            '@resvg/resvg-js',
          ],
          patterns: [
            ...restrictedImports.patterns,
            'react/*',
            'react-dom/*',
            'next/*',
            'node:*',
            '@/server/*',
            '@/db/*',
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'fetch', 'Date'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded renderer PRNG.' },
        { object: 'Date', property: 'now', message: 'Renderer output must be deterministic.' },
      ],
    },
  },
  {
    files: ['components/**/*.{ts,tsx}', 'hooks/**/*.{ts,tsx}', 'lib/client/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [...restrictedImports.paths, '@/server/auth', '@/lib/env.server'],
          patterns: [
            ...restrictedImports.patterns,
            '@/db/*',
            '@/server/services/*',
            '@/server/queries/*',
            '@/server/admin-queries/*',
            '@/server/storage/*',
            '@/server/render/*',
          ],
        },
      ],
    },
  },
]);
