import { randomUUID } from 'node:crypto';
import { neon, Pool } from '@neondatabase/serverless';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as pooledDrizzle } from 'drizzle-orm/neon-serverless';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { renderSampleSpec, playgroundStateSchema } from '../../content/render-sample';
import { user } from '../../db/schema/auth';
import { favorites } from '../../db/schema/engagement';
import { themes } from '../../db/schema/themes';
import type * as FavoritesService from '../../server/services/favorites';

vi.mock('server-only', () => ({}));
const holder = vi.hoisted(() => ({ database: undefined as unknown, pooled: undefined as unknown }));
vi.mock('../../db/index', () => ({
  get db(): unknown {
    if (!holder.database) throw new Error('Isolated favorites DB not ready');
    return holder.database;
  },
}));
vi.mock('../../db/pool', () => ({
  get dbPool(): unknown {
    if (!holder.pooled) throw new Error('Isolated favorites pool not ready');
    return holder.pooled;
  },
}));
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const token = randomUUID();
const owner = `p11-favorites-${token}`,
  other = `p11-other-${token}`,
  banned = `p11-banned-${token}`;
const people = [owner, other, banned];
const published = randomUUID(),
  draft = randomUUID(),
  archived = randomUUID();
const themeIds = [published, draft, archived];

describe.skipIf(!TEST_DATABASE_URL)(
  'favorites atomic operations against isolated Neon fixtures',
  () => {
    let database: ReturnType<typeof drizzle>;
    let pool: Pool | undefined;
    let service: typeof FavoritesService;
    beforeAll(async () => {
      const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
      database = drizzle({ client: neon(url) });
      pool = new Pool({ connectionString: url, max: 12 });
      holder.database = database;
      holder.pooled = pooledDrizzle({ client: pool });
      service = await import('../../server/services/favorites');
      await database.insert(user).values(
        people.map((id) => ({
          id,
          email: `${id}@example.invalid`,
          name: 'Disposable favorite fixture',
          banned: id === banned,
        })),
      );
      const spec = renderSampleSpec(playgroundStateSchema.parse({}));
      await database.insert(themes).values(
        themeIds.map((id, index) => ({
          id,
          slug: `p11-${id}`,
          source: 'generated' as const,
          status: (['published', 'draft', 'archived'] as const)[index],
          ownerId: owner,
          nameEn: 'Disposable favorite fixture',
          spec,
          specHash: '0'.repeat(64),
        })),
      );
    });
    afterAll(async () => {
      try {
        if (database) {
          await database.delete(themes).where(inArray(themes.id, themeIds));
          await database.delete(user).where(inArray(user.id, people));
        }
      } finally {
        await pool?.end();
        holder.database = undefined;
        holder.pooled = undefined;
      }
    });
    async function reset(): Promise<void> {
      await database.delete(favorites).where(inArray(favorites.userId, people));
    }
    async function exists(): Promise<boolean> {
      const rows = await database
        .select()
        .from(favorites)
        .where(and(eq(favorites.userId, owner), eq(favorites.themeId, published)));
      return rows.length === 1;
    }
    it('toggles twice back to the original state and keeps accounts isolated', async () => {
      await reset();
      expect((await service.toggleFavorite(owner, published)).data.favorited).toBe(true);
      expect(await service.listFavoriteIds(other)).toEqual([]);
      expect((await service.toggleFavorite(owner, published)).data.favorited).toBe(false);
      expect(await exists()).toBe(false);
    });
    it('rejects missing/private/archived themes and banned or absent accounts', async () => {
      await reset();
      for (const id of [draft, archived, randomUUID()])
        await expect(service.toggleFavorite(owner, id)).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });
      await expect(service.toggleFavorite(banned, published)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(service.toggleFavorite(`missing-${token}`, published)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
      expect(await exists()).toBe(false);
    });
    it('filters merge inputs to published themes, deduplicates, and remains idempotent', async () => {
      await reset();
      expect((await service.mergeLocalFavorites(owner, [])).data.merged).toBe(0);
      await expect(service.mergeLocalFavorites(banned, [published])).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(
        (
          await service.mergeLocalFavorites(owner, [
            published,
            published,
            draft,
            archived,
            randomUUID(),
          ])
        ).data.merged,
      ).toBe(1);
      expect((await service.mergeLocalFavorites(owner, [published])).data.merged).toBe(0);
      expect(await service.listFavoriteIds(owner)).toEqual([published]);
      await database.update(themes).set({ status: 'archived' }).where(eq(themes.id, published));
      try {
        expect(await service.listFavoriteIds(owner)).toEqual([]);
      } finally {
        await database.update(themes).set({ status: 'published' }).where(eq(themes.id, published));
      }
    });
    it.each([10, 11])(
      'linearizes %i concurrent toggles, including an initially absent favorite',
      async (count) => {
        await reset();
        const settled = await Promise.allSettled(
          Array.from({ length: count }, () => service.toggleFavorite(owner, published)),
        );
        const rejected = settled.filter((row) => row.status === 'rejected');
        expect(rejected).toEqual([]);
        const values = settled.flatMap((row) =>
          row.status === 'fulfilled' ? [row.value.data.favorited] : [],
        );
        expect(values.filter(Boolean)).toHaveLength(Math.ceil(count / 2));
        expect(await exists()).toBe(count % 2 === 1);
      },
      20_000,
    );
  },
);
