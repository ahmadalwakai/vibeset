import { describe, expect, expectTypeOf, it } from 'vitest';
import { ZodError, type input } from 'zod';
import type { ThemeListQuery } from '../../../lib/dto';
import * as clientCursor from '../../../lib/validation/cursor-boundaries';
import * as clientQuery from '../../../lib/validation/theme-query';
import * as serverCursor from '../../../lib/utils/cursor';
import * as serverQuery from '../../../lib/validation/themes';

const id = 'abcdefab-0000-4000-8000-000000000001';
const second = 'abcdefab-0000-4000-8000-000000000002';

describe('canonical Mini query boundary and classic server facade', () => {
  it('preserves NFC, repeated tag inputs, canonical ordering and normalized UUID lookup mode', () => {
    const input = new URLSearchParams('q=e%CC%81x&tags=y2k&tags=calm&tags=y2k&unused=ignored');
    const query = clientQuery.themeListQuerySchema.parse(input);
    expect(query).toEqual({ q: 'éx', tags: ['calm', 'y2k'], sort: 'trending', limit: 24 });
    expect(serverQuery.themeListQuerySchema.parse(input)).toEqual(query);
    expect(clientQuery.serializeThemeListQuery(query)).toBe('q=%C3%A9x&tags=calm%2Cy2k');
    expect(clientQuery.exploreHref(query)).toBe('/explore?q=%C3%A9x&tags=calm%2Cy2k');
    expect(clientQuery.exploreHref({ sort: 'trending', limit: 24 })).toBe('/explore');
    const lookup = new URLSearchParams([
      ['ids', second.toUpperCase()],
      ['ids', id.toUpperCase()],
      ['ids', second],
      ['q', 'x'],
      ['q', 'ignored'],
      ['limit', '999'],
      ['cursor', 'broken'],
    ]);
    const expected = { ids: [second, id], sort: 'trending', limit: 24 };
    expect(clientQuery.themeListQuerySchema.parse(lookup)).toEqual(expected);
    expect(serverQuery.themeListQuerySchema.parse(lookup)).toEqual(expected);
  });

  it.each([
    new URLSearchParams('q=calm&q=pink'),
    new URLSearchParams('sort=new&sort=popular'),
    new URLSearchParams('limit=24&limit=48'),
    new URLSearchParams('color=pink&color=blue'),
    { q: 'e\u0301' },
    { q: 'valid\u0000text' },
    { q: 'a'.repeat(65) },
    { tags: ['a', 'b', 'c', 'd', 'e', 'f'] },
    { tags: ['valid\n'] },
    { tags: Array.from({ length: 101 }, () => 'calm') },
    { ids: Array.from({ length: 101 }, () => id) },
    { ids: [id + '\n'] },
    { ids: [] },
    { limit: 0 },
    { limit: 49 },
    { limit: Infinity },
    { limit: NaN },
    { limit: '0048' },
    { limit: '1e1' },
  ])('rejects the same malformed query at both boundaries %#', (input) => {
    expect(clientQuery.themeListQuerySchema.safeParse(input).success).toBe(false);
    const parsed = serverQuery.themeListQuerySchema.safeParse(input);
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('Expected server validation failure');
    expect(parsed.error).toBeInstanceOf(ZodError);
  });

  it('retains the raw-list bound before deduplication and the normalized search length', () => {
    expect(clientQuery.themeListQuerySchema.parse({ tags: Array(100).fill('calm') }).tags).toEqual([
      'calm',
    ]);
    expect(clientQuery.themeListQuerySchema.parse({ q: '  e\u0301x  ', limit: '048' })).toEqual({
      q: 'éx',
      sort: 'trending',
      limit: 48,
    });
    expect(clientQuery.themeListQuerySchema.safeParse({ q: 'a'.repeat(64) }).success).toBe(true);
  });

  it('preserves tolerant recovery and canonical helper output without weakening strict parsing', () => {
    const input = new URLSearchParams('q=x&color=pink&sort=new&limit=999&cursor=broken');
    const expected = {
      q: undefined,
      tags: undefined,
      color: 'pink',
      sort: 'new',
      limit: 24,
    } satisfies ThemeListQuery;
    expect(clientQuery.normalizeThemeListQuery(input)).toEqual(expected);
    expect(serverQuery.normalizeThemeListQuery(input)).toEqual(expected);
    expect(clientQuery.themeQueryKey(expected)).toBe(serverQuery.themeQueryKey(expected));
    expect(() =>
      Reflect.apply(serverQuery.serializeThemeListQuery, undefined, [
        { sort: 'unknown', limit: 24 },
      ]),
    ).toThrow(ZodError);
  });

  it('keeps classic error identity and cursor field paths for server query callers', () => {
    expectTypeOf<input<typeof serverQuery.collectionCursorSchema>>().toEqualTypeOf<
      string | null | undefined
    >();
    const cursor = clientCursor.encodeCursor({ k: 'popular', s: 2, id });
    const parsed = serverQuery.themeListQuerySchema.safeParse({ sort: 'new', cursor });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('Expected cursor-mode failure');
    expect(parsed.error).toBeInstanceOf(ZodError);
    expect(parsed.error.issues).toMatchObject([{ path: ['cursor'], code: 'custom' }]);
    expect(() => serverQuery.parseCollectionPageQuery({ cursor })).toThrow(ZodError);
    expect(serverQuery.parseCollectionPageQuery(new URLSearchParams('unused=yes'))).toEqual({});
    expect(serverQuery.parseCollectionPageQuery({})).toEqual({});
    expect(serverQuery.parseCollectionPageQuery({ cursor: null })).toEqual({ cursor: null });
    expect(() =>
      serverQuery.parseCollectionPageQuery(new URLSearchParams('cursor=a&cursor=b')),
    ).toThrow(ZodError);
  });
});

describe('Mini cursor codec compatibility', () => {
  it('keeps exact encoded bytes, lowercase UUIDs and six-digit UTC precision', () => {
    const value = { k: 'new' as const, s: '2026-10-24T12:34:56.123456Z', id };
    const token = btoa(JSON.stringify(value))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
    expect(clientCursor.encodeCursor({ ...value, id: id.toUpperCase() })).toBe(token);
    expect(serverCursor.encodeCursor(value)).toBe(token);
    expect(clientCursor.decodeCursor(token, 'new')).toEqual(value);
    expect(serverCursor.decodeCursor(token, 'new')).toEqual(value);
    for (const offset of [0, 1, 200]) {
      expect(clientCursor.encodeOffsetCursor(offset)).toBe(serverCursor.encodeOffsetCursor(offset));
      expect(clientCursor.decodeOffsetCursor(serverCursor.encodeOffsetCursor(offset))).toBe(offset);
    }
    const collection = clientCursor.encodeCollectionCursor({ s: -4, id: id.toUpperCase() });
    expect(collection).toBe(serverCursor.encodeCollectionCursor({ s: -4, id }));
    expect(serverCursor.decodeCollectionCursor(collection)).toEqual({ k: 'collection', s: -4, id });
  });

  it.each([
    '',
    'a',
    '!!!!',
    'x'.repeat(1025),
    btoa('{}'),
    'eyJvIjowfR', // Different unused base64 bits decode to the same JSON; reject noncanonical encoding.
    clientCursor.encodeOffsetCursor(0) + '=',
    btoa(JSON.stringify({ k: 'trending', s: 1, id, extra: true })).replace(/=+$/, ''),
  ])('rejects malformed tokens in Mini and preserves classic server error identity %#', (token) => {
    expect(() => clientCursor.decodeCursor(token, 'trending')).toThrow();
    expect(() => serverCursor.decodeCursor(token, 'trending')).toThrow(ZodError);
    expect(() => clientCursor.decodeOffsetCursor(token)).toThrow();
    expect(() => serverCursor.decodeOffsetCursor(token)).toThrow(ZodError);
    expect(() => clientCursor.decodeCollectionCursor(token)).toThrow();
    expect(() => serverCursor.decodeCollectionCursor(token)).toThrow(ZodError);
  });

  it('rejects incompatible modes, nonfinite scores, offsets and invalid timestamp precision', () => {
    const popular = clientCursor.encodeCursor({ k: 'popular', s: 4, id });
    expect(() => clientCursor.decodeCursor(popular, 'new')).toThrow();
    expect(() => serverCursor.decodeCursor(popular, 'new')).toThrow(ZodError);
    for (const score of [Infinity, NaN, -Infinity]) {
      expect(() => clientCursor.encodeCursor({ k: 'trending', s: score, id })).toThrow();
      expect(() => serverCursor.encodeCursor({ k: 'trending', s: score, id })).toThrow(ZodError);
    }
    for (const offset of [-1, 1.5, 201]) {
      expect(() => clientCursor.encodeOffsetCursor(offset)).toThrow();
      expect(() => serverCursor.encodeOffsetCursor(offset)).toThrow(ZodError);
    }
    for (const time of [
      '2026-02-30T00:00:00Z',
      '2026-10-24T00:00:00.1234567Z',
      '2026-10-24T00:00:00+01:00',
    ]) {
      expect(() => clientCursor.encodeCursor({ k: 'new', s: time, id })).toThrow();
      expect(() => serverCursor.encodeCursor({ k: 'new', s: time, id })).toThrow(ZodError);
    }
  });
});
