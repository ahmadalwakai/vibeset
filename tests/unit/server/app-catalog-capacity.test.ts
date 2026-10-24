import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { assertAppCatalogCapacity } from '../../../server/services/app-catalog-lock';
import type { AdminTransaction } from '../../../server/services/admin-access';
describe('public catalogue capacity', () => {
  it('allows the browser boundary and refuses a write that would exceed it', async () => {
    const execute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ total: 5000 }] })
        .mockResolvedValueOnce({ rows: [{ total: 5001 }] }),
      tx = { execute } as unknown as AdminTransaction;
    await expect(assertAppCatalogCapacity(tx, 1)).resolves.toBeUndefined();
    await expect(assertAppCatalogCapacity(tx, ['new-app'])).rejects.toMatchObject({
      code: 'VALIDATION',
      fieldErrors: { isActive: ['limit'] },
    });
  });
});
