import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../server/errors';
const guard = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('../../../server/guards', () => ({ requireAdmin: guard }));
vi.mock('../../../lib/env.client', () => ({
  env: { NEXT_PUBLIC_CDN_URL: 'https://cdn.example.invalid' },
}));
vi.mock('../../../db', () => {
  throw new Error('Denied query imported DB');
});
import {
  listAdminCollections,
  getAdminCollection,
  listAdminTags,
  listAdminApps,
  listAdminAppOrder,
  searchAdminPublishedThemes,
} from '../../../server/admin-queries/content';
const reads = [
  ['collections', () => listAdminCollections({})],
  ['collection', () => getAdminCollection('bad-id')],
  ['tags', () => listAdminTags({})],
  ['apps', () => listAdminApps({})],
  ['app order', () => listAdminAppOrder()],
  ['published picker', () => searchAdminPublishedThemes({})],
] as const;
describe('private content queries', () => {
  it.each(reads)(
    '%s establishes admin authority before loading DB or parsing IDs',
    async (_name, call) => {
      for (const code of ['UNAUTHENTICATED', 'FORBIDDEN'] as const) {
        guard.mockRejectedValueOnce(new AppError(code));
        await expect(call()).rejects.toMatchObject({ code });
      }
    },
  );
});
