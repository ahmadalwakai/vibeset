import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['tests/setup/database-guard.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/render/**', 'server/services/**', 'lib/utils/**'],
      reporter: ['text', 'html', 'json', 'json-summary'],
      thresholds: {
        'lib/render/**': { lines: 80 },
        'server/services/**': { lines: 70 },
        'lib/utils/**': { lines: 90 },
      },
    },
  },
});
