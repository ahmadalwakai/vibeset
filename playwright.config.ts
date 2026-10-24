import { defineConfig, devices } from '@playwright/test';
import { z } from 'zod';

const baseURL = z
  .url({ protocol: /^https?$/ })
  .parse(process.env.E2E_BASE_URL || 'http://localhost:3000');
const parsed = new URL(baseURL);
if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash)
  throw new Error('E2E_BASE_URL must be a credential-free site origin');
if (process.env.VERCEL_ENV === 'production') throw new Error('Production E2E execution is refused');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL,
    locale: 'en-GB',
    reducedMotion: 'reduce',
    colorScheme: 'light',
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15'], browserName: 'webkit' } },
    { name: 'android', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], browserName: 'chromium' } },
  ],
});
