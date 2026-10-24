import { test, expect } from './fixtures';
import en from '../../messages/en.json' with { type: 'json' };
import { createSubmission } from './ui';

test.use({ role: 'creator' });
test('approved creator creates a generated theme and sees its pending submission', async ({
  page,
  manifest,
}, info) => {
  await createSubmission(
    page,
    manifest,
    `E2E creator ${info.project.name} ${manifest.runId.slice(0, 8)} ${info.retry}`,
  );
  await page.reload();
  await expect(page.getByText(en.creator.status.pending_review, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: en.creator.editor.withdraw, exact: true }),
  ).toBeEnabled();
});
