import { describe, expect, it } from 'vitest';
import {
  aestheticSlugSchema,
  collectionSlugSchema,
  creatorHandleSchema,
  normalizeThemeListQuery,
  serializeThemeListQuery,
  themeListQuerySchema,
  themeQueryKey,
  themePageResponseSchema,
  apiErrorSchema,
} from '../../../lib/validation/themes';
import { encodeCursor, encodeOffsetCursor } from '../../../lib/utils/cursor';

const id = '00000000-0000-4000-8000-000000000001';
describe('public theme query normalization', () => {
  it('normalizes URL strings, AND-tag ordering and defaults', () => {
    const query = themeListQuerySchema.parse(
      new URLSearchParams('q=++calm++&tags=y2k,calm,y2k&unused=yes'),
    );
    expect(query).toMatchObject({ q: 'calm', tags: ['calm', 'y2k'], sort: 'trending', limit: 24 });
    expect(serializeThemeListQuery(query)).toBe('q=calm&tags=calm%2Cy2k');
    expect(themeQueryKey({ ...query, tags: ['y2k', 'calm'] })).toBe(themeQueryKey(query));
    expect(themeListQuerySchema.parse({ tags: [] })).toMatchObject({ tags: undefined });
  });
  it('deduplicates IDs in first-occurrence order and ignores every other input', () => {
    const second = '00000000-0000-4000-8000-000000000002';
    const query = themeListQuerySchema.parse({
      ids: `${second},${id},${second}`,
      q: 'x',
      sort: 'unknown',
      limit: 999,
      cursor: 'broken',
      tags: 7,
    });
    expect(query).toEqual({ ids: [second, id], sort: 'trending', limit: 24 });
    expect(serializeThemeListQuery(query)).toBe(`ids=${second}%2C${id}`);
  });
  it.each([
    { q: 'x' },
    { q: 'e\u0301' },
    { q: 'a'.repeat(65) },
    { q: 'valid\nword' },
    { color: 'violet' },
    { tags: ['a', 'b', 'c', 'd', 'e', 'f'] },
    { tags: ['bad/slash'] },
    { limit: 0 },
    { limit: 49 },
    { limit: true },
    { limit: '1e1' },
    { sort: 'old' },
    { ids: ['not-a-uuid'] },
    { ids: [] },
    { ids: Array.from({ length: 101 }, () => id) },
    { q: ['calm', 'pink'] },
  ])('rejects invalid query input %#', (input) =>
    expect(themeListQuerySchema.safeParse(input).success).toBe(false),
  );
  it('requires the matching search/keyset cursor mode and requested sort', () => {
    const cursor = encodeCursor({ k: 'popular', s: 5, id });
    expect(themeListQuerySchema.safeParse({ sort: 'popular', cursor }).success).toBe(true);
    expect(themeListQuerySchema.safeParse({ sort: 'new', cursor }).success).toBe(false);
    expect(themeListQuerySchema.safeParse({ q: 'calm', cursor }).success).toBe(false);
    expect(
      themeListQuerySchema.safeParse({ q: 'calm', cursor: encodeOffsetCursor(200) }).success,
    ).toBe(true);
  });
  it('tolerantly normalizes page URLs while strict API validation rejects them', () => {
    expect(
      normalizeThemeListQuery({
        q: 'x',
        color: 'pink',
        limit: '999',
        cursor: 'broken',
        sort: 'new',
      }),
    ).toEqual({ q: undefined, tags: undefined, color: 'pink', sort: 'new', limit: 24 });
  });
  it('validates route segments and API response bodies without unsafe assertions', () => {
    for (const schema of [aestheticSlugSchema, collectionSlugSchema, creatorHandleSchema])
      expect(schema.safeParse('valid\n').success).toBe(false);
    expect(
      themePageResponseSchema.safeParse({ data: { items: [], nextCursor: null } }).success,
    ).toBe(true);
    expect(
      themePageResponseSchema.safeParse({ data: { items: [{ id }], nextCursor: null } }).success,
    ).toBe(false);
    expect(
      apiErrorSchema.safeParse({ error: { code: 'FORBIDDEN', message: 'ignored' } }).success,
    ).toBe(true);
    expect(apiErrorSchema.safeParse({ error: { code: 'DATABASE_PASSWORD' } }).success).toBe(false);
  });
});
