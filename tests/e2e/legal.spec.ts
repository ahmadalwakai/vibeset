import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page, Request } from '@playwright/test';
import ar from '../../messages/ar.json' with { type: 'json' };
import en from '../../messages/en.json' with { type: 'json' };
import { trackInputSchema } from '../../lib/validation/track';
import { VIEW_STATISTICS_KEY } from '../../lib/validation/view-statistics';
import { test, expect } from './fixtures';

const documents = [
  { doc: 'terms', en: 'Terms of use', ar: 'شروط الاستخدام' },
  { doc: 'privacy', en: 'Privacy notice', ar: 'إشعار الخصوصية' },
  { doc: 'copyright', en: 'Copyright and credits', ar: 'حقوق النشر والمصادر' },
] as const;

async function statisticsControl(page: Page, locale: 'en' | 'ar' = 'en'): Promise<Locator> {
  const copy = locale === 'ar' ? ar : en;
  const control = page.getByRole('region', { name: copy.legal.statistics.title, exact: true });
  await expect(control).toBeVisible();
  // The server renders this control disabled until its preference store hydrates.
  await expect(
    control.getByRole('checkbox', { name: copy.legal.statistics.label, exact: true }),
  ).toBeEnabled();
  return control;
}

async function renderFrames(page: Page): Promise<void> {
  // A working client interaction precedes this bounded render/effect window.
  // Avoid elapsed-time sleeps or network-idle waits for a negative assertion.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let remaining = 4;
        const frame = (): void => {
          remaining -= 1;
          if (remaining === 0) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
}

async function hydratedTheme(page: Page, name: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  const actions = page.getByRole('group', { name: en.theme.actions.label, exact: true });
  const more = actions.getByRole('button', { name: en.theme.actions.more, exact: true });
  await expect(more).toBeEnabled();
  await more.click();
  const menu = page.getByRole('menu');
  await expect(
    menu.getByRole('menuitem', { name: en.theme.actions.share, exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await renderFrames(page);
}

function themeView(request: Request, themeId: string): boolean {
  if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/track') return false;
  try {
    const body: unknown = request.postDataJSON();
    const parsed = trackInputSchema.safeParse(body);
    return parsed.success && parsed.data.themeId === themeId && parsed.data.event === 'view';
  } catch {
    return false;
  }
}

for (const locale of ['en', 'ar'] as const) {
  const prefix = locale === 'ar' ? '/ar' : '';
  const copy = locale === 'ar' ? ar : en;

  for (const legalDoc of documents) {
    test(`${locale} ${legalDoc.doc} is readable, localized, linked and accessible at 360px`, async ({
      page,
      manifest,
    }, info) => {
      await page.setViewportSize({ width: 360, height: 800 });
      const path = `/legal/${legalDoc.doc}`;
      await page.goto(`${prefix}${path}`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      const main = page.getByRole('main');
      const heading = main.getByRole('heading', { level: 1 });
      await expect(heading).toHaveCount(1);
      await expect(heading).toHaveText(legalDoc[locale]);
      await expect(main.getByText('Ahmad Alwakai', { exact: false }).first()).toBeVisible();
      await expect(main.locator('a[href="mailto:ahmadalwakai@gmx.com"]').first()).toBeVisible();
      await expect(main.locator('p').first()).toBeVisible();
      await expect(
        main.getByRole('navigation', { name: legalDoc[locale], exact: true }),
      ).toBeVisible();
      if (legalDoc.doc === 'privacy') await statisticsControl(page, locale);
      await page.evaluate(() => document.fonts.ready);
      // WebKit serializes zero tracking as "normal"; both reject negative Arabic spacing.
      if (locale === 'ar')
        await expect(main.getByRole('heading', { level: 2 }).first()).toHaveCSS(
          'letter-spacing',
          /^(?:0px|normal)$/,
        );
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
              document.documentElement.clientWidth,
          ),
        )
        .toBeLessThanOrEqual(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        new URL(`${prefix}${path}`, manifest.baseURL).href,
      );
      for (const [language, localizedPath] of [
        ['en', path],
        ['ar', `/ar${path}`],
        ['x-default', path],
      ] as const) {
        await expect(page.locator(`link[rel="alternate"][hreflang="${language}"]`)).toHaveAttribute(
          'href',
          new URL(localizedPath, manifest.baseURL).href,
        );
      }
      const scan = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        scan.violations
          .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
          .map(({ id, impact, nodes }) => ({
            id,
            impact,
            nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
          })),
      ).toEqual([]);
      await page.screenshot({ path: info.outputPath('legal-light.png') });
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect(page.locator('html')).toHaveClass(/\bdark\b/);
      const darkScan = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        darkScan.violations
          .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
          .map(({ id, impact, nodes }) => ({
            id,
            impact,
            nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
          })),
      ).toEqual([]);
      await page.screenshot({ path: info.outputPath('legal-dark.png') });
      if (legalDoc.doc === 'privacy') {
        const control = await statisticsControl(page, locale);
        await control.scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('privacy-control-dark.png') });
      }
    });
  }

  test(`${locale} unknown legal documents show the localized not-found UI and noindex`, async ({
    page,
  }) => {
    await page.goto(`${prefix}/legal/not-a-legal-document`);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(
      page.getByRole('heading', { level: 1, name: copy.common.notFound.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: copy.common.notFound.home, exact: true }),
    ).toBeVisible();
    // A streamed Next notFound response can already have sent 200 headers.
    // Assert the user-visible boundary and crawler directive instead of a status promise.
    await expect
      .poll(async () => {
        const directives = await page
          .locator('meta[name="robots"]')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('content') ?? ''));
        return directives.some((value) => /(?:^|,)\s*noindex\s*(?:,|$)/i.test(value));
      })
      .toBe(true);
  });
}

test('automatic views stay off until chosen, send a real view when enabled, and stop after withdrawal', async ({
  page,
  manifest,
}) => {
  const [first, second] = manifest.themes;
  if (!first || !second) throw new Error('Two published fixtures are required');
  const views: Request[] = [];
  const observe = (request: Request): void => {
    if (themeView(request, first.id) || themeView(request, second.id)) views.push(request);
  };
  page.on('request', observe);
  try {
    await page.goto('/legal/privacy');
    let control = await statisticsControl(page);
    const checkbox = (): Locator =>
      control.getByRole('checkbox', { name: en.legal.statistics.label, exact: true });
    const label = (): Locator =>
      control.locator('label').filter({ hasText: en.legal.statistics.label });
    await expect(checkbox()).not.toBeChecked();
    expect(await page.evaluate((key) => localStorage.getItem(key), VIEW_STATISTICS_KEY)).toBeNull();

    await page.goto(`/t/${first.slug}`);
    await hydratedTheme(page, first.nameEn);
    expect(views.filter((request) => themeView(request, first.id))).toHaveLength(0);
    expect(
      await page.evaluate((id) => sessionStorage.getItem(`vibeset:viewed:${id}`), first.id),
    ).toBeNull();

    await page.goto('/legal/privacy');
    control = await statisticsControl(page);
    // Chakra uses a visually hidden native input; activate its visible wrapping label.
    await label().click();
    await expect(checkbox()).toBeChecked();
    await expect(control.getByRole('status')).toHaveText(en.legal.statistics.enabled);
    await page.reload();
    control = await statisticsControl(page);
    await expect(checkbox()).toBeChecked();

    const [response] = await Promise.all([
      page.waitForResponse((entry) => themeView(entry.request(), first.id)),
      page.goto(`/t/${first.slug}`),
    ]);
    expect(response.status()).toBe(204);
    await response.finished();
    await hydratedTheme(page, first.nameEn);
    expect(views.filter((request) => themeView(request, first.id))).toHaveLength(1);
    expect(
      await page.evaluate((id) => sessionStorage.getItem(`vibeset:viewed:${id}`), first.id),
    ).toBe('1');

    await page.goto('/legal/privacy');
    control = await statisticsControl(page);
    await expect(checkbox()).toBeChecked();
    await label().click();
    await expect(checkbox()).not.toBeChecked();
    await expect(control.getByRole('status')).toHaveText(en.legal.statistics.disabled);
    await page.reload();
    control = await statisticsControl(page);
    await expect(checkbox()).not.toBeChecked();

    await page.goto(`/t/${second.slug}`);
    await hydratedTheme(page, second.nameEn);
    expect(views.filter((request) => themeView(request, second.id))).toHaveLength(0);
    expect(
      await page.evaluate((id) => sessionStorage.getItem(`vibeset:viewed:${id}`), second.id),
    ).toBeNull();
  } finally {
    page.off('request', observe);
  }
});
