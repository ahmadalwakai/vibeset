import 'server-only';

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type * as PoolModule from '../../db/pool';
import type * as DatabaseModule from '../../db/index';
import type { FavoriteMergeData, FavoriteToggleData } from '../../lib/favorites';
import {
  favoriteIdsSchema,
  favoriteThemeIdSchema,
  favoriteUserIdSchema,
  localFavoriteIdsSchema,
} from '../../lib/validation/favorites';
import { AppError } from '../errors';

let poolModule: Promise<typeof PoolModule> | undefined;
let databaseModule: Promise<typeof DatabaseModule> | undefined;

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError('VALIDATION', 'Invalid favorite input');
  return parsed.data;
}

function eligible(result: { accountExists: boolean; banned: boolean | null }): void {
  if (!result.accountExists) throw new AppError('UNAUTHENTICATED');
  if (result.banned) throw new AppError('FORBIDDEN');
}

export async function toggleFavorite(
  userId: string,
  themeId: string,
): Promise<{ data: FavoriteToggleData; tags: string[] }> {
  const owner = parse(favoriteUserIdSchema, userId);
  const id = parse(favoriteThemeIdSchema, themeId);
  const { dbPool } = await (poolModule ??= import('../../db/pool'));
  return dbPool.transaction(
    async (tx) => {
      // A preceding command gives the next statement a fresh READ COMMITTED snapshot.
      // Locking inside a CTE alone cannot see a favorite inserted while that CTE waited.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`favorite:${owner}:${id}`}, 0))`,
      );
      const response = await tx.execute(sql`
      WITH principal AS MATERIALIZED (
        SELECT id, banned FROM "user" WHERE id = ${owner} FOR SHARE
      ), published AS MATERIALIZED (
        SELECT id FROM themes WHERE id = ${id}::uuid AND status = 'published' FOR SHARE
      ), deleted AS (
        DELETE FROM favorites WHERE user_id = ${owner}
          AND theme_id IN (SELECT id FROM published)
          AND EXISTS (SELECT 1 FROM principal WHERE banned IS NOT TRUE)
        RETURNING theme_id
      ), inserted AS (
        INSERT INTO favorites (user_id, theme_id)
        SELECT principal.id, published.id FROM principal CROSS JOIN published
        WHERE principal.banned IS NOT TRUE AND NOT EXISTS (SELECT 1 FROM deleted)
        ON CONFLICT (user_id, theme_id) DO NOTHING RETURNING theme_id
      )
      SELECT EXISTS (SELECT 1 FROM principal) AS "accountExists",
        (SELECT banned FROM principal) AS banned,
        EXISTS (SELECT 1 FROM published) AS published,
        NOT EXISTS (SELECT 1 FROM deleted) AS favorited,
        (SELECT count(*) FROM inserted)::int AS inserted
    `);
      const row = z
        .object({
          accountExists: z.boolean(),
          banned: z.boolean().nullable(),
          published: z.boolean(),
          favorited: z.boolean(),
        })
        .parse(response.rows[0]);
      eligible(row);
      if (!row.published) throw new AppError('NOT_FOUND');
      return { data: { favorited: row.favorited }, tags: [] };
    },
    { isolationLevel: 'read committed' },
  );
}

export async function mergeLocalFavorites(
  userId: string,
  themeIds: readonly string[],
): Promise<{ data: FavoriteMergeData; tags: string[] }> {
  const owner = parse(favoriteUserIdSchema, userId);
  const ids = parse(localFavoriteIdsSchema, themeIds);
  const { db } = await (databaseModule ??= import('../../db/index'));
  const response = await db.execute(sql`
    WITH principal AS MATERIALIZED (
      SELECT id, banned FROM "user" WHERE id = ${owner} FOR SHARE
    ), published AS MATERIALIZED (
      SELECT id FROM themes WHERE id = ANY(ARRAY[${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}]::uuid[]) AND status = 'published' ORDER BY id FOR SHARE
    ), inserted AS (
      INSERT INTO favorites (user_id, theme_id)
      SELECT principal.id, published.id FROM principal CROSS JOIN published
      WHERE principal.banned IS NOT TRUE
      ON CONFLICT (user_id, theme_id) DO NOTHING RETURNING theme_id
    )
    SELECT EXISTS (SELECT 1 FROM principal) AS "accountExists",
      (SELECT banned FROM principal) AS banned, (SELECT count(*) FROM inserted)::int AS merged
  `);
  const row = z
    .object({
      accountExists: z.boolean(),
      banned: z.boolean().nullable(),
      merged: z.number().int().min(0).max(500),
    })
    .parse(response.rows[0]);
  eligible(row);
  return { data: { merged: row.merged }, tags: [] };
}

export async function listFavoriteIds(userId: string): Promise<string[]> {
  const owner = parse(favoriteUserIdSchema, userId);
  const { db } = await (databaseModule ??= import('../../db/index'));
  const response = await db.execute(sql`
    SELECT favorites.theme_id AS id FROM favorites JOIN themes ON themes.id = favorites.theme_id
    WHERE favorites.user_id = ${owner} AND themes.status = 'published'
    ORDER BY favorites.created_at DESC, favorites.theme_id ASC
  `);
  return favoriteIdsSchema.parse(
    response.rows.map((row) => z.object({ id: favoriteThemeIdSchema }).parse(row).id),
  );
}
