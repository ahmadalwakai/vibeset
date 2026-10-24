import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { MAX_LOCAL_FAVORITES } from '../../../lib/favorites';
import type { ActionResult } from '../../../lib/result';
import { actorSchema, themeIdSchema as serverThemeIdSchema } from '../../../lib/theme-status';
import { actorIdSchema, themeIdSchema } from '../../../lib/validation/identifiers';
import * as browser from '../../../lib/validation/favorite-boundaries';
import * as server from '../../../lib/validation/favorites';

const id = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const secondId = 'fedcbafe-dcba-4fed-8cba-fedcbafedcba';

describe('canonical Mini identifiers with classic server compatibility', () => {
  it('retains string and nested input types for controlled forms and server actions', () => {
    expectTypeOf<z.input<typeof serverThemeIdSchema>>().toEqualTypeOf<string>();
    expectTypeOf<
      z.input<(typeof actorSchema.options)[0]['shape']['userId']>
    >().toEqualTypeOf<string>();
    expectTypeOf<z.input<typeof server.favoriteUserIdSchema>>().toEqualTypeOf<string>();
    expectTypeOf<z.input<typeof server.favoriteThemeIdSchema>>().toEqualTypeOf<string>();
    expectTypeOf<z.input<typeof server.favoriteIdsSchema>>().toEqualTypeOf<string[]>();
    expectTypeOf<z.input<typeof server.localFavoriteIdsSchema>>().toEqualTypeOf<string[]>();
    expectTypeOf<z.input<typeof server.toggleFavoriteSchema>>().toEqualTypeOf<{
      themeId: string;
    }>();
    expectTypeOf<z.input<typeof server.mergeLocalFavoritesSchema>>().toEqualTypeOf<{
      themeIds: string[];
    }>();
    expectTypeOf<z.input<typeof server.favoriteIdsResponseSchema>>().toEqualTypeOf<{
      data: { themeIds: string[] };
    }>();
    expectTypeOf<z.input<typeof server.favoriteToggleDataSchema>>().toEqualTypeOf<{
      favorited: boolean;
    }>();
    expectTypeOf<z.input<typeof server.favoriteMergeDataSchema>>().toEqualTypeOf<{
      merged: number;
    }>();
    expectTypeOf<z.input<typeof server.favoriteToggleResultSchema>>().toEqualTypeOf<
      ActionResult<{ favorited: boolean }>
    >();
    expectTypeOf<z.input<typeof server.favoriteMergeResultSchema>>().toEqualTypeOf<
      ActionResult<{ merged: number }>
    >();
  });

  it('normalizes UUID case and preserves strict UUID boundaries on both sides', () => {
    for (const schema of [themeIdSchema, serverThemeIdSchema, browser.favoriteThemeIdSchema]) {
      expect(schema.parse(id.toUpperCase())).toBe(id);
      for (const value of [null, 123, '', 'owner', ` ${id}`, `${id}\n`, `${id}x`])
        expect(schema.safeParse(value).success).toBe(false);
    }
    expect(() => serverThemeIdSchema.parse(`${id}\n`)).toThrow(z.ZodError);
  });

  it('retains trimmed opaque actor IDs, their original length limit and forbidden characters', () => {
    for (const schema of [
      actorIdSchema,
      browser.favoriteUserIdSchema,
      server.favoriteUserIdSchema,
    ]) {
      expect(schema.parse(' \towner-أحمد\n')).toBe('owner-أحمد');
      expect(schema.parse('a'.repeat(256))).toHaveLength(256);
      for (const value of [null, '', ' \t', 'a'.repeat(257), 'two words', 'a\nb', 'a\0b', 'a\x7fb'])
        expect(schema.safeParse(value).success).toBe(false);
    }
    expect(
      actorSchema.parse({ kind: 'user', userId: ' owner ', role: 'user', isCreator: false }),
    ).toEqual({ kind: 'user', userId: 'owner', role: 'user', isCreator: false });
    expect(() => server.favoriteUserIdSchema.parse('a\nb')).toThrow(z.ZodError);
  });
});

describe.each([
  { name: 'browser Mini', schemas: browser },
  { name: 'server classic wrapper', schemas: server },
])('$name favorites boundary', ({ schemas }) => {
  it('deduplicates canonical IDs in first-occurrence order and applies the raw local cap', () => {
    expect(schemas.favoriteIdsSchema.parse([id.toUpperCase(), secondId, id])).toEqual([
      id,
      secondId,
    ]);
    expect(schemas.localFavoriteIdsSchema.parse(Array(MAX_LOCAL_FAVORITES).fill(id))).toEqual([id]);
    expect(
      schemas.localFavoriteIdsSchema.safeParse(Array(MAX_LOCAL_FAVORITES + 1).fill(id)).success,
    ).toBe(false);
    expect(schemas.favoriteIdsSchema.parse(Array(MAX_LOCAL_FAVORITES + 1).fill(id))).toEqual([id]);
  });

  it('refuses identity injection and unexpected input or response fields at every strict level', () => {
    expect(schemas.toggleFavoriteSchema.parse({ themeId: id.toUpperCase() })).toEqual({
      themeId: id,
    });
    expect(schemas.mergeLocalFavoritesSchema.parse({ themeIds: [id, id] })).toEqual({
      themeIds: [id],
    });
    expect(schemas.favoriteIdsResponseSchema.parse({ data: { themeIds: [id, id] } })).toEqual({
      data: { themeIds: [id] },
    });
    for (const [schema, value] of [
      [schemas.toggleFavoriteSchema, { themeId: id, userId: 'foreign' }],
      [schemas.mergeLocalFavoritesSchema, { themeIds: [id], userId: 'foreign' }],
      [schemas.favoriteIdsResponseSchema, { data: { themeIds: [id] }, private: true }],
      [schemas.favoriteIdsResponseSchema, { data: { themeIds: [id], private: true } }],
      [schemas.favoriteToggleDataSchema, { favorited: true, themeId: id }],
      [schemas.favoriteMergeDataSchema, { merged: 1, private: true }],
    ] as const)
      expect(schema.safeParse(value).success).toBe(false);
  });

  it('accepts only bounded integer merge counts and typed success payloads', () => {
    for (const merged of [0, MAX_LOCAL_FAVORITES])
      expect(schemas.favoriteMergeResultSchema.parse({ ok: true, data: { merged } })).toEqual({
        ok: true,
        data: { merged },
      });
    for (const merged of [-1, 0.5, 501, Number.POSITIVE_INFINITY, '1'])
      expect(
        schemas.favoriteMergeResultSchema.safeParse({ ok: true, data: { merged } }).success,
      ).toBe(false);
    expect(
      schemas.favoriteToggleResultSchema.parse({ ok: true, data: { favorited: false } }),
    ).toEqual({ ok: true, data: { favorited: false } });
    for (const value of [
      { ok: true, data: { favorited: 'true' } },
      { ok: true, data: { favorited: true }, error: {} },
      { ok: true, data: { favorited: true, userId: 'foreign' } },
    ])
      expect(schemas.favoriteToggleResultSchema.safeParse(value).success).toBe(false);
  });

  it('preserves recognized action errors and field arrays while stripping inner unknown fields', () => {
    const withoutFields = { ok: false, error: { code: 'RATE_LIMITED', message: 'Limited' } };
    expect(schemas.favoriteToggleResultSchema.parse(withoutFields)).toEqual(withoutFields);
    expect(schemas.favoriteMergeResultSchema.parse(withoutFields)).toEqual(withoutFields);
    const error = {
      code: 'VALIDATION',
      message: 'Invalid input',
      fieldErrors: { themeId: ['Invalid UUID'] },
      internal: 'not part of the public result',
    };
    const expected = {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors,
      },
    };
    expect(schemas.favoriteToggleResultSchema.parse({ ok: false, error })).toEqual(expected);
    expect(schemas.favoriteMergeResultSchema.parse({ ok: false, error })).toEqual(expected);
    for (const invalid of [
      { ...error, code: '__proto__' },
      { ...error, code: 'NONEXISTENT' },
      { ...error, message: 'x'.repeat(2_001) },
      { ...error, fieldErrors: { themeId: 'Invalid UUID' } },
      { ...error, fieldErrors: { themeId: [12] } },
    ]) {
      expect(
        schemas.favoriteToggleResultSchema.safeParse({ ok: false, error: invalid }).success,
      ).toBe(false);
      expect(
        schemas.favoriteMergeResultSchema.safeParse({ ok: false, error: invalid }).success,
      ).toBe(false);
    }
  });
});

it('retains classic errors and nested field paths for server actions without widening createAction', () => {
  const result = server.mergeLocalFavoritesSchema.safeParse({ themeIds: [`${id}\n`] });
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Invalid UUID was accepted');
  expect(result.error).toBeInstanceOf(z.ZodError);
  expect(result.error.issues[0]?.path).toEqual(['themeIds', 0]);
  expect(z.flattenError(result.error).fieldErrors.themeIds).toEqual(
    expect.arrayContaining([expect.any(String)]),
  );
  const input: z.ZodType<{ themeIds: string[] }> = server.mergeLocalFavoritesSchema;
  expect(input.parse({ themeIds: [id.toUpperCase(), id] })).toEqual({ themeIds: [id] });
});
