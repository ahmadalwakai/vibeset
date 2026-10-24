import { test, expect } from './fixtures';
import en from '../../messages/en.json' with { type: 'json' };
import { closeSheet } from './ui';
import { authState, projectName } from './runtime';
import { favoriteIdsResponseSchema } from '../../lib/validation/favorites';

test.use({ role: 'user' });

test('user saves a card, manages an unlisted collection, and saves a remix', async ({
  page,
  browser,
  manifest,
}, info) => {
  const first = manifest.themes[0],
    second = manifest.themes[1];
  if (!first || !second) throw new Error('Two published fixtures are required');
  const title = `E2E ${info.project.name} ${manifest.runId.slice(0, 8)} ${info.retry}`;
  await test.step(
    'Save a card and confirm the committed favorite in Saved',
    async () => {
      await page.goto(`/explore?q=${encodeURIComponent(first.nameEn)}`);
      const save = page.getByRole('button', {
        name: `${en.theme.favorites.save}: ${first.nameEn}`,
        exact: true,
      });
      const remove = page.getByRole('button', {
        name: `${en.theme.favorites.remove}: ${first.nameEn}`,
        exact: true,
      });
      // Streamed results can mount after goto resolves; resolve state only once its control is ready.
      await expect(save.or(remove)).toBeVisible();
      await expect(save.or(remove)).toBeEnabled();
      if (await save.isVisible()) {
        const [mutation] = await Promise.all([
          page.waitForResponse(
            (response) =>
              response.request().method() === 'POST' &&
              new URL(response.url()).pathname === '/explore' &&
              Boolean(response.request().postData()?.includes(first.id)),
            { timeout: 15_000 },
          ),
          save.click(),
        ]);
        // The RSC page stream can outlive the action; UI pending + the private JSON read prove commit.
        expect(mutation.ok(), 'The UI toggle response headers must be successful').toBe(true);
      }
      await expect(remove).toHaveAttribute('aria-busy', 'false');
      const confirmation = await page.request.get('/api/me/favorites');
      expect(confirmation.ok(), 'The private favorites read must succeed').toBe(true);
      const confirmed = favoriteIdsResponseSchema.parse(await confirmation.json());
      expect(confirmed.data.themeIds, 'The toggle must persist before leaving Explore').toContain(
        first.id,
      );
      await page.goto('/saved');
      await expect(page.locator(`main a[href="/t/${first.slug}"]`)).toBeVisible();
    },
    { timeout: 25_000 },
  );
  await test.step(
    'Create an unlisted collection',
    async () => {
      await page.getByRole('tab', { name: en.saved.tabs.collections, exact: true }).click();
      await page.getByRole('button', { name: en.saved.collections.create, exact: true }).click();
      await page.getByLabel(en.saved.collections.titleLabel, { exact: true }).fill(title);
      await page
        .getByLabel(en.saved.collections.visibilityLabel, { exact: true })
        .selectOption('unlisted');
      await page
        .getByRole('dialog')
        .getByRole('button', { name: en.saved.collections.create, exact: true })
        .click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
    },
    { timeout: 25_000 },
  );
  for (const theme of [first, second]) {
    await test.step(
      `Add ${theme.nameEn} and confirm the membership commit`,
      async () => {
        await page.goto(`/t/${theme.slug}`);
        await page
          .getByRole('group', { name: en.theme.actions.label, exact: true })
          .getByRole('button', { name: en.theme.actions.more, exact: true })
          .click();
        await page
          .getByRole('menuitem', { name: en.saved.collections.saveToCollection, exact: true })
          .click();
        const dialog = page.getByRole('dialog', {
          name: en.saved.collections.saveToCollection,
          exact: true,
        });
        const choice = dialog.getByRole('checkbox', { name: new RegExp(title) });
        await expect(choice).not.toBeChecked();
        await expect(choice).toBeEnabled();
        const [response] = await Promise.all([
          page.waitForResponse(
            (entry) =>
              entry.request().method() === 'POST' &&
              new URL(entry.url()).pathname === `/t/${theme.slug}` &&
              Boolean(
                entry.request().postData()?.includes(theme.id) &&
                entry.request().postData()?.includes('collectionId'),
              ),
            { timeout: 15_000 },
          ),
          // Chakra's input is visually hidden; click its visible wrapping label as a touch user does.
          dialog.locator('label').filter({ hasText: title }).click({ timeout: 15_000 }),
        ]);
        expect(response.ok()).toBe(true);
        await expect(choice).toBeChecked();
        await expect(choice).toBeEnabled();
        await expect(page.getByText(en.saved.collections.added, { exact: true })).toBeVisible();
        await closeSheet(page);
      },
      { timeout: 25_000 },
    );
  }
  await test.step(
    'Reorder, reload, and read the unlisted collection as a visitor',
    async () => {
      await page.goto('/saved');
      await page.getByRole('tab', { name: en.saved.tabs.collections, exact: true }).click();
      const collectionLink = page.getByRole('link', { name: title, exact: true });
      const href = await collectionLink.getAttribute('href');
      if (!href || !/^\/collections\/u\/[0-9a-f-]{36}$/.test(href))
        throw new Error('Expected a user collection link');
      const collectionURL = new URL(href, manifest.baseURL).href;
      await collectionLink.click();
      await expect(page).toHaveURL(collectionURL);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      // Unlisted collections share this same route; the Copy link control proves its persisted visibility.
      await expect(
        page.getByRole('button', { name: en.saved.collections.copyLink, exact: true }),
      ).toBeVisible();
      const moveUp = page.getByRole('button', {
        name: `${en.saved.collections.moveUp}: ${second.nameEn}`,
        exact: true,
      });
      await moveUp.click();
      await expect(moveUp).toBeDisabled();
      await expect(page.getByText(en.saved.collections.orderSaved, { exact: true })).toBeVisible();
      await page.reload();
      await expect(moveUp).toBeDisabled();
      const publicContext = await browser.newContext({
        baseURL: manifest.baseURL,
        storageState: authState(projectName(info.project.name), 'visitor'),
      });
      try {
        const shared = await publicContext.newPage();
        await shared.goto(collectionURL);
        await expect(shared.locator(`main a[href="/t/${first.slug}"]`)).toBeVisible();
        await expect(shared.locator(`main a[href="/t/${second.slug}"]`)).toBeVisible();
        await expect(
          shared.getByRole('button', { name: en.saved.collections.delete, exact: true }),
        ).toHaveCount(0);
      } finally {
        await publicContext.close();
      }
    },
    { timeout: 25_000 },
  );
  await test.step(
    'Save a remix and read its persisted entry in Saved',
    async () => {
      await page.goto(`/studio?from=${first.slug}`);
      await page.getByRole('button', { name: en.studio.toolbar.save, exact: true }).click();
      const remix = `${title} remix`;
      await page.getByLabel(en.studio.save.name, { exact: true }).fill(remix);
      await page.getByRole('button', { name: en.studio.save.submit, exact: true }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await page.goto('/saved');
      await page.getByRole('tab', { name: en.saved.tabs.remixes, exact: true }).click();
      await expect(page.getByRole('heading', { name: remix, exact: true })).toBeVisible();
    },
    { timeout: 25_000 },
  );
});

test('user exports its account data', async ({ page }) => {
  await page.goto('/account');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: en.account.exportButton, exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe('vibeset-account.json');
});

test.describe('throwaway deletion', () => {
  test.describe.configure({ retries: 0 });
  test.use({ role: 'deleteUser' });
  test('clears the session and makes a subsequent private request fail', async ({ page }) => {
    await page.goto('/account');
    await page.getByRole('button', { name: en.account.deleteButton, exact: true }).click();
    const dialog = page.getByRole('alertdialog', {
      name: en.account.deleteConfirmTitle,
      exact: true,
    });
    await dialog.getByRole('textbox').fill(en.account.deleteWord);
    await dialog.getByRole('button', { name: en.account.deleteButton, exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    const response = await page.request.get('/api/account/export');
    expect(response.status()).toBe(401);
  });
});
