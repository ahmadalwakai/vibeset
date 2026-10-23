import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as relations from '../../db/relations';
import * as tables from '../../db/schema';
import { collections, themes } from '../../db/schema';
import { specHash } from '../../lib/render/hash';
import { themeSpecSchema } from '../../lib/render/spec';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const schema = { ...tables, ...relations };

function createTestDatabase() {
  const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
  return drizzle({ client: neon(url), schema });
}

function sampleSpec() {
  return themeSpecSchema.parse({
    v: 1,
    palette: {
      mode: 'light',
      bg: '#faf8fc',
      surface: '#ffffff',
      primary: '#9734b1',
      accent: '#ff8b58',
      ink: '#16121d',
      inkMuted: '#665c76',
    },
    wallpaper: { kind: 'mesh', seed: 42, points: 5, softness: 0.5, grain: 0.08, colors: null },
    lockWallpaper: null,
    icons: {
      shape: 'squircle',
      fill: 'solid',
      bg: '#9734b1',
      bg2: null,
      glyphColor: '#ffffff',
      glyphWeight: 'regular',
      glyphScale: 0.55,
      border: null,
      sticker: null,
      shadow: false,
    },
    widgets: {
      style: 'glass',
      radius: 0.25,
      surface: '#ffffff',
      ink: '#16121d',
      accent: '#ff8b58',
    },
    type: { display: 'fraunces', body: 'readex-pro' },
    decor: ['sparkle', 'heart'],
  });
}

describe.skipIf(!TEST_DATABASE_URL)('Neon database migrations', () => {
  it('finds a valid theme through generated full-text search and trigram matching', async () => {
    const db = createTestDatabase();
    const id = randomUUID();
    const spec = sampleSpec();

    try {
      await db.insert(themes).values({
        id,
        slug: `integration-search-${id}`,
        source: 'generated',
        nameEn: 'Lavender',
        nameAr: 'لافندر',
        tagsText: 'pastel soft هادئ',
        spec,
        specHash: await specHash(spec),
      });

      const [byName, byTag, byTypo] = await Promise.all([
        db
          .select({ id: themes.id, spec: themes.spec })
          .from(themes)
          .where(
            and(
              eq(themes.id, id),
              sql`${themes.searchVector} @@ websearch_to_tsquery('simple', 'lavender')`,
            ),
          ),
        db
          .select({ id: themes.id })
          .from(themes)
          .where(
            and(
              eq(themes.id, id),
              sql`${themes.searchVector} @@ websearch_to_tsquery('simple', 'pastel')`,
            ),
          ),
        db
          .select({ id: themes.id })
          .from(themes)
          .where(and(eq(themes.id, id), sql`${themes.nameEn} % 'lavendr'`)),
      ]);

      expect(byName).toEqual([{ id, spec }]);
      expect(byTag).toEqual([{ id }]);
      expect(byTypo).toEqual([{ id }]);
    } finally {
      await db.delete(themes).where(eq(themes.id, id));
    }
  }, 30_000);

  it.each([
    {
      name: 'a user collection without an owner',
      values: { kind: 'user' as const },
      constraint: 'collections_owner_kind_chk',
    },
    {
      name: 'an editorial collection without a slug',
      values: { kind: 'editorial' as const },
      constraint: 'collections_slug_kind_chk',
    },
    {
      name: 'a seasonal collection with a reversed window',
      values: {
        kind: 'seasonal' as const,
        startsAt: new Date('2026-10-24T00:00:00Z'),
        endsAt: new Date('2026-10-23T00:00:00Z'),
      },
      constraint: 'collections_window_chk',
    },
  ])(
    'rejects $name through its database constraint',
    async ({ values, constraint }) => {
      const db = createTestDatabase();
      const id = randomUUID();

      try {
        const insert = db.insert(collections).values({
          id,
          titleEn: 'Integration constraint check',
          ...values,
          slug: values.kind === 'seasonal' ? `integration-window-${id}` : null,
        });

        await expect(insert).rejects.toMatchObject({
          cause: { code: '23514', constraint },
        });
      } finally {
        await db.delete(collections).where(eq(collections.id, id));
      }
    },
    30_000,
  );
});
