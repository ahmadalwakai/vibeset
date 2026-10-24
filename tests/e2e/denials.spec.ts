import { test, expect } from './fixtures';
import en from '../../messages/en.json' with { type: 'json' };
import { projectName } from './runtime';

test('guest is redirected from private pages and cannot read private data', async ({ page }) => {
  for (const path of ['/account', '/creator/themes', '/admin/themes']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  }
  expect((await page.request.get('/api/account/export')).status()).toBe(401);
});

test.describe('ordinary user authority', () => {
  test.use({ role: 'user' });
  test('cannot open admin or approved-creator pages, nor use disabled Better Auth admin endpoints', async ({
    page,
    manifest,
  }, info) => {
    for (const path of ['/admin/themes', '/creator/themes']) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: en.common.notFound.title, exact: true }),
      ).toBeVisible();
      await expect
        .poll(async () => {
          const directives = await page
            .locator('meta[name="robots"]')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('content') ?? ''));
          return (
            directives.length > 0 &&
            directives.every((value) => /(?:^|,)\s*noindex\s*(?:,|$)/i.test(value))
          );
        })
        .toBe(true);
    }
    const response = await page.request.post('/api/auth/admin/set-role', {
      data: {
        userId: manifest.projects[projectName(info.project.name)].accounts.user.id,
        role: 'admin',
      },
    });
    expect(response.status()).toBe(404);
  });
});
