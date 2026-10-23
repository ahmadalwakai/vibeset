import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

const { updateTag, revalidateTag } = vi.hoisted(() => ({
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ updateTag, revalidateTag, cacheLife: vi.fn(), cacheTag: vi.fn() }));

import { CacheTags, invalidate } from '../../../server/cache';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cache invalidation', () => {
  it('uses the documented dynamic tag namespaces', () => {
    expect(CacheTags.theme('lavender')).toBe('theme:lavender');
    expect(CacheTags.collection('spring')).toBe('collection:spring');
    expect(CacheTags.creator('soft_vibes')).toBe('creator:soft_vibes');
  });

  it('deduplicates read-your-writes invalidations', () => {
    invalidate([CacheTags.themes, CacheTags.themes, CacheTags.settings], 'update');
    expect(updateTag.mock.calls).toEqual([['themes'], ['settings']]);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('uses stale-while-revalidate for route-handler invalidation', () => {
    invalidate([CacheTags.themes, CacheTags.themes], 'revalidate');
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith('themes', 'max');
    expect(updateTag).not.toHaveBeenCalled();
  });

  it('rejects invalid tags before invalidating any valid prefix', () => {
    expect(() => invalidate([CacheTags.themes, 'x'.repeat(257)], 'update')).toThrow(ZodError);
    expect(updateTag).not.toHaveBeenCalled();
  });
});
