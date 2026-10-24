import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  execute: vi.fn(),
  requireUser: vi.fn(),
  rateLimit: vi.fn(),
  getIpHash: vi.fn(),
  toggle: vi.fn(),
  merge: vi.fn(),
  list: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../db/index', () => ({ db: { execute: mocks.execute } }));
vi.mock('../../../db/pool', () => ({ dbPool: { transaction: mocks.transaction } }));
import {
  listFavoriteIds,
  mergeLocalFavorites,
  toggleFavorite,
} from '../../../server/services/favorites';

const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => vi.resetAllMocks());

describe('favorites service boundaries', () => {
  it('rejects invalid identities and ids before touching any database', async () => {
    await expect(toggleFavorite('user', '../theme')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(toggleFavorite('', id)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      mergeLocalFavorites(
        'user',
        Array.from({ length: 501 }, () => id),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(listFavoriteIds('')).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([
    [{ accountExists: false, banned: null, published: true, favorited: true }, 'UNAUTHENTICATED'],
    [{ accountExists: true, banned: true, published: true, favorited: true }, 'FORBIDDEN'],
    [{ accountExists: true, banned: false, published: false, favorited: true }, 'NOT_FOUND'],
  ] as const)(
    'rechecks account/publication eligibility in the mutation result',
    async (row, code) => {
      const execute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [row] });
      mocks.transaction.mockImplementation(
        (callback: (tx: { execute: typeof execute }) => Promise<unknown>) => callback({ execute }),
      );
      await expect(toggleFavorite('user', id)).rejects.toMatchObject({ code });
      expect(execute).toHaveBeenCalledTimes(2);
    },
  );
  it('returns authoritative toggle and published-only merge/list outputs', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ accountExists: true, banned: false, published: true, favorited: false }],
      });
    mocks.transaction.mockImplementation(
      (callback: (tx: { execute: typeof execute }) => Promise<unknown>) => callback({ execute }),
    );
    expect(await toggleFavorite('user', id)).toEqual({ data: { favorited: false }, tags: [] });
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ accountExists: true, banned: false, merged: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id }] });
    expect(await mergeLocalFavorites('user', [id, id])).toEqual({ data: { merged: 1 }, tags: [] });
    expect(await listFavoriteIds('user')).toEqual([id]);
  });
});
