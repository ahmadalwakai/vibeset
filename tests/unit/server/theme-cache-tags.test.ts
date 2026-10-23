import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../db/index', () => ({ db: { select: mocks.select } }));
import { getThemeCacheTags } from '../../../server/services/theme-cache-tags';

function selection(rows: unknown[]): {
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
} {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
}
const theme = {
  id: 'fc56c582-0e16-4989-9371-f7918468ef6a',
  slug: 'tagged-theme',
  ownerId: 'creator-user',
};
beforeEach(() => vi.resetAllMocks());

describe('theme public-impact invalidation tags', () => {
  it('includes containing collections and creator handle, deduplicating without tagging private null slugs', async () => {
    mocks.select
      .mockReturnValueOnce(
        selection([{ slug: 'soft-looks' }, { slug: null }, { slug: 'soft-looks' }]),
      )
      .mockReturnValueOnce(selection([{ handle: 'soft_creator' }]));
    expect(await getThemeCacheTags(theme)).toEqual([
      'themes',
      'theme:tagged-theme',
      'collections',
      'collection:soft-looks',
      'creator:soft_creator',
    ]);
  });

  it('returns base tags and skips a creator lookup for an unowned theme', async () => {
    mocks.select.mockReturnValueOnce(selection([]));
    expect(await getThemeCacheTags({ ...theme, ownerId: null })).toEqual([
      'themes',
      'theme:tagged-theme',
      'collections',
    ]);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it('validates the theme identity before querying the database', async () => {
    await expect(getThemeCacheTags({ ...theme, id: 'invalid' })).rejects.toThrow();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
