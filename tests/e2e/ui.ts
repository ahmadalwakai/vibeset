import { expect, test, type Page, type Request, type Response } from '@playwright/test';
import { z } from 'zod';
import en from '../../messages/en.json' with { type: 'json' };
import { createCreatorThemeSchema } from '../../lib/validation/creator';
import { themeSpecSchema } from '../../lib/render/spec';
import type { E2eManifest } from './manifest';

const creatorDescription = 'An original generated design created by the disposable browser test.';

function creatorPayloadSummary(raw: string | null, name: string, aesthetic: string): unknown {
  if (!raw || raw.length > 131_072) return { parsed: false, bounded: Boolean(raw) };
  try {
    const parsed: unknown = JSON.parse(raw);
    const record = z.record(z.string(), z.unknown());
    const payload: unknown = Array.isArray(parsed)
      ? parsed.find((value: unknown) => {
          const candidate = record.safeParse(value);
          return candidate.success && Object.hasOwn(candidate.data, 'spec');
        })
      : parsed;
    const fields = record.safeParse(payload);
    const schema = createCreatorThemeSchema.safeParse(payload);
    if (!fields.success) return { parsed: false };
    const value = fields.data;
    return {
      parsed: true,
      nameMatches: value.nameEn === name,
      nameLength: typeof value.nameEn === 'string' ? value.nameEn.length : null,
      descriptionMatches: value.descriptionEn === creatorDescription,
      descriptionLength:
        typeof value.descriptionEn === 'string' ? value.descriptionEn.length : null,
      aestheticMatches: Array.isArray(value.tagSlugs) && value.tagSlugs.includes(aesthetic),
      specValid: themeSpecSchema.safeParse(value.spec).success,
      schemaIssuePaths: schema.success
        ? []
        : schema.error.issues.map((issue) => issue.path.map(String).join('.') || 'root'),
    };
  } catch {
    return { parsed: false };
  }
}

async function creatorFieldSummary(page: Page, name: string, aesthetic: string): Promise<unknown> {
  const fields = [
    { key: 'nameEn', label: en.creator.editor.nameEn, expected: name },
    { key: 'descriptionEn', label: en.creator.editor.descriptionEn, expected: creatorDescription },
    { key: 'aesthetic', label: en.creator.editor.aesthetic, expected: aesthetic },
  ];
  const values: unknown[] = [];
  for (const field of fields) {
    const input = page.getByLabel(field.label, { exact: true });
    const present = await input.count();
    values.push({
      key: field.key,
      present: present === 1,
      ...(present === 1
        ? {
            matches: (await input.inputValue()) === field.expected,
            length: (await input.inputValue()).length,
            invalid: (await input.getAttribute('aria-invalid')) === 'true',
          }
        : {}),
    });
  }
  return values;
}

export async function closeSheet(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog').last();
  await dialog.getByRole('button', { name: en.common.close, exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
export async function openStudioPanel(page: Page, name: string): Promise<void> {
  const mobile = page.getByRole('button', { name, exact: true });
  if ((page.viewportSize()?.width ?? 1280) < 1024) await mobile.click();
  else await page.getByRole('tab', { name, exact: true }).click();
}
export async function editBackground(page: Page, value: string): Promise<void> {
  await openStudioPanel(page, en.studio.panels.colors);
  const input = page.getByRole('textbox', {
    name: `${en.studio.fields.bg} · ${en.studio.fields.hex}`,
    exact: true,
  });
  await input.fill(value);
  await input.press('Tab');
  await expect(input).toHaveValue(new RegExp(value, 'i'));
  if (await page.getByRole('dialog').isVisible()) await closeSheet(page);
}
export async function createSubmission(
  page: Page,
  manifest: E2eManifest,
  name: string,
): Promise<string> {
  await page.goto('/creator/themes/new');
  await openStudioPanel(page, en.creator.editor.detailsPanel);
  await page.getByLabel(en.creator.editor.nameEn, { exact: true }).fill(name);
  await page.getByLabel(en.creator.editor.descriptionEn, { exact: true }).fill(creatorDescription);
  await page
    .getByLabel(en.creator.editor.aesthetic, { exact: true })
    .selectOption(manifest.aestheticSlug);
  await expect(page.getByLabel(en.creator.editor.nameEn, { exact: true })).toHaveValue(name);
  await expect(page.getByLabel(en.creator.editor.descriptionEn, { exact: true })).toHaveValue(
    creatorDescription,
  );
  await expect(page.getByLabel(en.creator.editor.aesthetic, { exact: true })).toHaveValue(
    manifest.aestheticSlug,
  );
  if (await page.getByRole('dialog').isVisible()) await closeSheet(page);
  const requests = new Set<Request>();
  const statuses: number[] = [];
  let payload: unknown = null;
  const request = (value: Request): void => {
    if (value.method() !== 'POST' || new URL(value.url()).pathname !== '/creator/themes/new')
      return;
    requests.add(value);
    payload = creatorPayloadSummary(value.postData(), name, manifest.aestheticSlug);
  };
  const response = (value: Response): void => {
    if (requests.has(value.request()) && statuses.length < 10) statuses.push(value.status());
  };
  page.on('request', request);
  page.on('response', response);
  try {
    await page.getByRole('button', { name: en.creator.editor.save, exact: true }).click();
    await expect(page).toHaveURL(/\/creator\/themes\/[0-9a-f-]{36}$/);
  } catch (error) {
    let fields: unknown = { available: false };
    try {
      if ((page.viewportSize()?.width ?? 1280) < 1024)
        await page
          .getByRole('button', { name: en.creator.editor.detailsPanel, exact: true })
          .click({ timeout: 3000 });
      await expect(page.getByLabel(en.creator.editor.nameEn, { exact: true })).toBeVisible({
        timeout: 3000,
      });
      fields = await creatorFieldSummary(page, name, manifest.aestheticSlug);
    } catch {}
    await test
      .info()
      .attach('creator-save-diagnostics', {
        body: JSON.stringify({
          requestCount: requests.size,
          responseStatuses: statuses,
          payload,
          fields,
        }),
        contentType: 'application/json',
      })
      .catch(() => undefined);
    throw error;
  } finally {
    page.off('request', request);
    page.off('response', response);
  }
  const id = new URL(page.url()).pathname.split('/').at(-1);
  if (!id) throw new Error('Created theme identity is missing');
  await page.getByRole('button', { name: en.creator.editor.submit, exact: true }).click();
  await expect(page.getByText(en.creator.status.pending_review, { exact: true })).toBeVisible();
  return id;
}
