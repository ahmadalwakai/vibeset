import type { Page } from '@playwright/test';
import ar from '../../messages/ar.json' with { type: 'json' };
import { test, expect } from './fixtures';

async function arabicPage(page: Page, path: string, heading: string): Promise<void> {
  await page.goto(path);
  await expect(page).toHaveURL((url) => url.pathname === path);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(
    page.getByRole('main').getByRole('heading', { name: heading, exact: true }),
  ).toBeVisible();
}

async function noErrorPage(page: Page): Promise<void> {
  for (const name of [ar.common.notFound.title, ar.common.errorTitle])
    await expect(page.getByRole('main').getByRole('heading', { name, exact: true })).toHaveCount(0);
}

test.describe('Arabic ordinary user', () => {
  test.use({ role: 'user' });
  test('can read Account and Saved while admin and creator routes stay forbidden', async ({
    page,
  }) => {
    await arabicPage(page, '/ar/account', ar.account.title);
    await expect(
      page.getByRole('button', { name: ar.account.exportButton, exact: true }),
    ).toBeVisible();
    await noErrorPage(page);
    await arabicPage(page, '/ar/saved', ar.saved.title);
    await expect(
      page.getByRole('tab', { name: ar.saved.tabs.collections, exact: true }),
    ).toBeVisible();
    await noErrorPage(page);
    for (const path of ['/ar/admin/themes', '/ar/creator/themes']) {
      await arabicPage(page, path, ar.common.notFound.title);
      await expect
        .poll(async () => {
          const values = await page
            .locator('meta[name="robots"]')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('content') ?? ''));
          return (
            values.length > 0 && values.every((value) => /(?:^|,)\s*noindex\s*(?:,|$)/i.test(value))
          );
        })
        .toBe(true);
    }
  });
});

test.describe('Arabic approved creator', () => {
  test.use({ role: 'creator' });
  test('can read the workspace and approved profile', async ({ page }) => {
    await arabicPage(page, '/ar/creator', ar.creator.dashboard.title);
    await expect(
      page
        .locator('main header')
        .getByRole('link', { name: ar.creator.dashboard.newTheme, exact: true }),
    ).toBeVisible();
    await noErrorPage(page);
    await arabicPage(page, '/ar/creator/profile', ar.creator.profile.title);
    await expect(
      page.getByRole('button', { name: ar.creator.profile.save, exact: true }),
    ).toBeVisible();
    await noErrorPage(page);
  });
});

test.describe('Arabic administrator', () => {
  test.use({ role: 'admin' });
  test('can read the dashboard and review queue', async ({ page }) => {
    await arabicPage(page, '/ar/admin', ar.admin.dashboard.title);
    await expect(
      page.getByRole('heading', { name: ar.admin.dashboard.downloadsChart, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(ar.admin.dashboard.published, { exact: true })).toBeVisible();
    await noErrorPage(page);
    await arabicPage(page, '/ar/admin/review', ar.admin.review.title);
    await expect(
      page
        .getByRole('button', { name: ar.admin.review.approve, exact: false })
        .or(page.getByRole('heading', { name: ar.admin.review.emptyTitle, exact: true }))
        .first(),
    ).toBeVisible();
    await noErrorPage(page);
  });
});
