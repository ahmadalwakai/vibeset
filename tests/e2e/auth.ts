import { expect, type Page } from '@playwright/test';
import { z } from 'zod';
import en from '../../messages/en.json' with { type: 'json' };
import type { E2eAccount, E2eManifest } from './manifest';
import { retryAfterMilliseconds } from './auth-rate-limit';

export class E2eSignInError extends Error {}

export async function assertDeployment(page: Page, manifest: E2eManifest): Promise<void> {
  await page.goto('/sign-in');
  const marker = page.locator('[data-e2e-enabled="true"]');
  await expect(marker).toHaveAttribute('data-database-fingerprint', manifest.databaseFingerprint);
}
export async function signIn(
  page: Page,
  account: E2eAccount,
  manifest: E2eManifest,
): Promise<void> {
  let phase = 'deployment',
    status: number | null = null,
    code = 'NONE';
  try {
    await assertDeployment(page, manifest);
    phase = 'hydration';
    await expect(page.locator('[data-e2e-enabled="true"]')).toHaveAttribute(
      'data-e2e-ready',
      'true',
      { timeout: 15_000 },
    );
    await page.getByLabel(en.auth.e2e.email, { exact: true }).fill(account.email);
    await page.getByLabel(en.auth.e2e.password, { exact: true }).fill(account.password);
    phase = 'request';
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(page.getByRole('button', { name: en.auth.e2e.submit, exact: true })).toBeEnabled(
        { timeout: 15_000 },
      );
      const [response] = await Promise.all([
        page.waitForResponse(
          (entry) =>
            new URL(entry.url()).pathname === '/api/auth/sign-in/email' &&
            entry.request().method() === 'POST',
          { timeout: 15_000 },
        ),
        page.getByRole('button', { name: en.auth.e2e.submit, exact: true }).click(),
      ]);
      status = response.status();
      if (status === 429 && attempt < 2) {
        const headers = response.headers();
        const delay = retryAfterMilliseconds(
          headers['retry-after'] ?? headers['x-retry-after'],
          Date.now(),
        );
        if (delay === null) {
          code = 'INVALID_RETRY_AFTER';
          throw new Error('Retry delay unavailable');
        }
        await page.waitForTimeout(delay);
        continue;
      }
      if (!response.ok()) {
        const parsed = z
          .object({
            code: z.enum([
              'INVALID_EMAIL_OR_PASSWORD',
              'USER_BANNED',
              'BANNED_USER',
              'TOO_MANY_REQUESTS',
              'USER_NOT_FOUND',
            ]),
          })
          .safeParse(await response.json());
        code = parsed.success ? parsed.data.code : 'UNEXPECTED_AUTH_RESPONSE';
        throw new Error('Authentication response was not successful');
      }
      break;
    }
    phase = 'navigation';
    await expect(page).not.toHaveURL(/\/sign-in(?:\?|$)/, { timeout: 15_000 });
    phase = 'session';
    await expect
      .poll(
        async () => {
          const current = await page.request.get('/api/auth/get-session?disableCookieCache=true');
          const result = z
            .object({ user: z.object({ id: z.string() }) })
            .safeParse(await current.json());
          return result.success ? result.data.user.id : null;
        },
        { timeout: 15_000 },
      )
      .toBe(account.id);
  } catch {
    // Never surface input values, request bodies or Playwright's credential call logs.
    throw new E2eSignInError(
      `E2E sign-in failed: phase=${phase}, status=${status ?? 'none'}, code=${code}`,
    );
  }
}
