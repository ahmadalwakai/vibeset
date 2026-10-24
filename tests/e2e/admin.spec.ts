import { z } from 'zod';
import { test, expect } from './fixtures';
import en from '../../messages/en.json' with { type: 'json' };
import { createSubmission } from './ui';
import type { Page } from '@playwright/test';
import type { E2eManifest } from './manifest';

test.use({ role: 'admin' });

async function approve(page: Page, manifest: E2eManifest, id: string, name: string): Promise<void> {
  await page.goto(`/admin/review?aesthetic=${manifest.aestheticSlug}`);
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await page.getByRole('heading', { name, exact: true }).isVisible()) break;
    await expect(
      page.getByRole('button', { name: en.admin.review.skip, exact: false }),
    ).toBeEnabled();
    await page.keyboard.press('s');
  }
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const committed = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      Boolean(
        response.request().postData()?.includes(id) &&
        response.request().postData()?.includes('approved'),
      ) &&
      new URL(response.url()).pathname === '/admin/review',
  );
  await page.keyboard.press('a');
  await committed;
  await page.goto(`/admin/themes/${id}`);
  await expect(page.getByText(en.creator.status.approved, { exact: true }).first()).toBeVisible();
}

test('admin reviews a real creator submission with the keyboard', async ({
  page,
  roleContext,
  manifest,
}, info) => {
  const creator = await roleContext('creator');
  const name = `E2E review ${info.project.name} ${manifest.runId.slice(0, 8)} ${info.retry}`;
  const id = await createSubmission(await creator.newPage(), manifest, name);
  await approve(page, manifest, id, name);
});

test('admin publishes through the real queue and exposes the result in Explore', async ({
  page,
  roleContext,
  manifest,
}, info) => {
  test.skip(
    !manifest.publishEnabled,
    'Pending: this run has no configured isolated R2 storage for real publication.',
  );
  const creator = await roleContext('creator');
  const name = `E2E publish ${info.project.name} ${manifest.runId.slice(0, 8)} ${info.retry}`;
  const id = await createSubmission(await creator.newPage(), manifest, name);
  await approve(page, manifest, id, name);
  await page.goto('/admin/publish?kind=approved');
  const selected = page.getByRole('checkbox', {
    name: en.admin.common.selectRow.replace('{name}', name),
    exact: true,
  });
  await expect(selected).toBeEnabled();
  await page.getByRole('listitem').filter({ has: selected }).locator('label').click();
  await expect(selected).toBeChecked();
  await expect(selected).toBeEnabled();
  const rendered = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/admin/themes/${id}/publish` &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', {
      name: en.admin.publish.publishSelected.replace('{count}', '1'),
      exact: true,
    })
    .click();
  expect((await rendered).status()).toBe(200);
  const publicData = await page.request.get(`/api/v1/themes?ids=${id}`);
  const result = z
    .object({
      data: z.object({ items: z.array(z.object({ id: z.uuid(), slug: z.string() })).length(1) }),
    })
    .parse(await publicData.json());
  expect(result.data.items[0]?.id).toBe(id);
  await page.goto(`/explore?q=${encodeURIComponent(name)}`);
  await expect(page.locator(`main a[href="/t/${result.data.items[0]?.slug}"]`)).toBeVisible();
});
