import { test, expect } from './fixtures';
import ar from '../../messages/ar.json' with { type: 'json' };

test('Arabic uses RTL, mirrors mobile navigation, and keeps phone artwork LTR', async ({
  page,
  manifest,
}, info) => {
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  if (info.project.name !== 'desktop') {
    const nav = page.getByRole('navigation', { name: ar.nav.mobile, exact: true });
    const home = await nav.getByRole('link', { name: ar.nav.home, exact: true }).boundingBox();
    const account = await nav
      .getByRole('link', { name: ar.nav.account, exact: true })
      .boundingBox();
    expect(home).not.toBeNull();
    expect(account).not.toBeNull();
    expect(home?.x).toBeGreaterThan(account?.x ?? Infinity);
  }
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('home-ar.png', {
    animations: 'disabled',
    mask: [page.locator('img')],
  });
  const theme = manifest.themes[0];
  if (!theme) throw new Error('Missing deterministic Studio fixture');
  // A bare Studio route intentionally chooses random artwork and toolbar availability.
  await page.goto(`/ar/studio?from=${theme.slug}`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('main [dir="ltr"]').first()).toBeVisible();
  await expect(page.getByRole('toolbar')).toBeVisible();
  await expect(
    page.getByRole('button', { name: ar.studio.toolbar.share, exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('studio-ar.png', {
    animations: 'disabled',
    mask: [page.locator('img')],
  });
});
