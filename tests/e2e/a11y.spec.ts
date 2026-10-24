import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function waitForEntranceFades(page: Page): Promise<void> {
  // Motion's entrance fades may start after the streamed content/fonts arrive.
  // Check the rendered endpoint, retaining every axe contrast rule unchanged.
  await expect
    .poll(() =>
      page.getByRole('main').evaluate((main) =>
        Array.from(main.querySelectorAll<HTMLElement>('[style*="opacity"]'))
          .filter(
            (element) =>
              element.getClientRects().length > 0 &&
              !element.matches(':disabled, [aria-disabled="true"]') &&
              getComputedStyle(element).visibility === 'visible' &&
              Number(getComputedStyle(element).opacity) < 1,
          )
          .map((element) => `${element.tagName}: ${getComputedStyle(element).opacity}`),
      ),
    )
    .toEqual([]);
}

function seriousViolations(scan: Awaited<ReturnType<AxeBuilder['analyze']>>): unknown[] {
  return scan.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
    }));
}

for (const locale of ['en', 'ar'] as const) {
  for (const target of ['home', 'explore', 'theme', 'studio', 'sign-in', 'saved'] as const) {
    test(`${locale} ${target} has no serious or critical accessibility violations`, async ({
      page,
      manifest,
    }) => {
      const first = manifest.themes[0];
      if (!first) throw new Error('Missing published fixture');
      const suffix = target === 'home' ? '' : target === 'theme' ? `t/${first.slug}` : target;
      const path = locale === 'ar' ? `/ar${suffix ? `/${suffix}` : ''}` : `/${suffix}`;
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      await waitForEntranceFades(page);
      if (target === 'sign-in') {
        const form = page.locator('[data-e2e-enabled="true"]');
        await expect(form).toHaveAttribute('data-e2e-ready', 'true');
        const submit = form.getByRole('button');
        await expect(submit).toBeEnabled();
        // Hydration enables this SSR-disabled control before its opacity transition finishes.
        await expect(submit).toHaveCSS('opacity', '1');
      }
      const scan = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(seriousViolations(scan)).toEqual([]);
    });
  }
}

test.describe('signed-in accessibility', () => {
  test.use({ role: 'user' });
  test('Saved remains accessible with private account tabs in both languages', async ({ page }) => {
    for (const path of ['/saved', '/ar/saved']) {
      await page.goto(path);
      await expect(page.getByRole('tablist')).toBeVisible();
      await waitForEntranceFades(page);
      const scan = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(seriousViolations(scan)).toEqual([]);
    }
  });
});
