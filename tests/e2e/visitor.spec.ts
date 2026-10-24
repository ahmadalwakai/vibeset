import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import en from '../../messages/en.json' with { type: 'json' };
import { editBackground } from './ui';
import { authState, projectName } from './runtime';

test('visitor browses, filters, searches and loads a real cursor page', async ({
  page,
  manifest,
}, info) => {
  await page.goto('/');
  await page.getByRole('link', { name: en.nav.explore, exact: true }).first().click();
  await expect(page).toHaveURL(/\/explore$/);
  const catalog = page.getByRole('main');
  await expect(catalog.getByRole('heading', { name: en.explore.title, exact: true })).toBeVisible();
  const chip = page.getByRole('button', { name: manifest.aestheticNameEn, exact: true });
  if (info.project.name !== 'desktop') await page.getByRole('button', { name: /^Filters/ }).click();
  await chip.click();
  if (await page.getByRole('dialog').isVisible())
    await page.getByRole('button', { name: en.explore.applyFilters, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(manifest.aestheticSlug));
  await page.getByRole('searchbox').last().fill(manifest.searchTerm);
  await expect(page).toHaveURL((url) => url.searchParams.get('q') === manifest.searchTerm);
  const next = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/v1/themes' && url.searchParams.has('cursor') && response.ok();
  });
  await catalog
    .getByRole('button', { name: en.common.loadMore, exact: true })
    .scrollIntoViewIfNeeded();
  await next;
  const cards = catalog.getByRole('link').and(catalog.locator('a[href^="/t/"]'));
  await expect.poll(() => cards.count()).toBeGreaterThan(24);
  const theme = manifest.themes[0];
  if (!theme) throw new Error('Missing published fixture');
  // Next retains hidden prior pages; role locators limit the click to the active catalog.
  const card = cards.and(catalog.locator(`a[href="/t/${theme.slug}"]`));
  await expect(card).toHaveCount(1);
  await card.click();
  await expect(page.getByRole('heading', { name: theme.nameEn, exact: true })).toBeVisible();
});

test('desktop saves a real wallpaper and a 24-icon PNG ZIP', async ({ page, manifest }, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'Native phone share pickers require the manual device matrix.',
  );
  const theme = manifest.themes[0];
  if (!theme) throw new Error('Missing published fixture');
  await page.goto(`/t/${theme.slug}`);
  await page.getByRole('button', { name: en.theme.actions.download, exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: en.theme.download.downloadFile, exact: true }).click();
  const wallpaper = await downloaded;
  expect(wallpaper.suggestedFilename()).toContain(theme.slug);
  expect(wallpaper.suggestedFilename()).toMatch(/\.jpg$/);
  expect(await wallpaper.failure()).toBeNull();
  await closeDownload(page);
  await page.getByRole('button', { name: en.theme.icons.getIcons, exact: true }).click();
  await page.getByRole('button', { name: en.theme.icons.generate, exact: true }).click();
  const zipped = page.waitForEvent('download');
  await page.getByRole('button', { name: en.theme.icons.downloadZip, exact: true }).click();
  const archive = await zipped;
  expect(archive.suggestedFilename()).toBe(`vibeset-${theme.slug}-icons.zip`);
  const file = await archive.path();
  if (!file) throw new Error('ZIP download was not retained');
  const { unzipSync } = await import('fflate');
  const entries = Object.values(unzipSync(await readFile(file)));
  expect(entries).toHaveLength(24);
  for (const bytes of entries) {
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect([header.getUint32(16), header.getUint32(20)]).toEqual([512, 512]);
  }
});

async function closeDownload(page: Page): Promise<void> {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: en.common.close, exact: true })
    .click();
}

test('desktop Studio share opens the edited design in a fresh context', async ({
  page,
  context,
  browser,
  manifest,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'Clipboard reading is verified in Chromium; native sharing remains a device check.',
  );
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const theme = manifest.themes[0];
  if (!theme) throw new Error('Missing published fixture');
  await page.goto(`/studio?from=${theme.slug}`);
  await editBackground(page, '#24224a');
  await page.getByRole('button', { name: en.studio.toolbar.share, exact: true }).click();
  await page.getByRole('menuitem', { name: en.studio.share.copyLink, exact: true }).click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(url).searchParams.get('s')).toBeTruthy();
  const fresh = await browser.newContext({
    baseURL: manifest.baseURL,
    storageState: authState(projectName(info.project.name), 'visitor'),
  });
  try {
    const opened = await fresh.newPage();
    await opened.goto(url);
    const { openStudioPanel } = await import('./ui');
    await openStudioPanel(opened, en.studio.panels.colors);
    await expect(
      opened.getByRole('textbox', {
        name: `${en.studio.fields.bg} · ${en.studio.fields.hex}`,
        exact: true,
      }),
    ).toHaveValue(/#24224a/i);
  } finally {
    await fresh.close();
  }
});
