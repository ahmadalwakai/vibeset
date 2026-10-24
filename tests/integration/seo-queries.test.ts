import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { renderSampleSpec, playgroundStateSchema } from '../../content/render-sample';
import { user } from '../../db/schema/auth';
import { collections } from '../../db/schema/collections';
import { creatorProfiles } from '../../db/schema/moderation';
import { tags } from '../../db/schema/taxonomy';
import { themes } from '../../db/schema/themes';
import { SITEMAP_STATIC_PATHS } from '../../lib/sitemap';
import type * as Sitemap from '../../server/queries/sitemap';
import type * as Seo from '../../server/queries/seo';
import type * as Cache from '../../server/cache';

vi.mock('server-only', () => ({}));
const holder = vi.hoisted(() => ({ database: undefined as unknown, tag: vi.fn() }));
vi.mock('../../db', () => ({
  get db(): unknown {
    if (!holder.database) throw new Error('Isolated fixture not ready');
    return holder.database;
  },
}));
vi.mock('../../server/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof Cache>()),
  cacheLife: vi.fn(),
  cacheTag: holder.tag,
}));
const testUrl = process.env.TEST_DATABASE_URL?.trim(),
  token = randomUUID(),
  short = token.replaceAll('-', '').slice(0, 12);
const ownerIds = [`p15-approved-${token}`, `p15-pending-${token}`];
const themeIds = Array.from({ length: 3 }, () => randomUUID()),
  tagIds = Array.from({ length: 3 }, () => randomUUID()),
  collectionIds = Array.from({ length: 4 }, () => randomUUID());

describe.skipIf(!testUrl)(
  'published sitemap and metadata query boundaries on isolated fixtures',
  () => {
    let database: ReturnType<typeof drizzle>, sitemap: typeof Sitemap, seo: typeof Seo;
    beforeAll(async () => {
      expect(process.env.VERCEL_ENV).not.toBe('production');
      const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(testUrl);
      const host = (value: string): string => new URL(value).hostname.replace(/-pooler(?=\.)/, '');
      for (const ordinary of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED])
        if (ordinary) expect(host(url)).not.toBe(host(ordinary));
      vi.stubEnv('DATABASE_URL', url);
      vi.stubEnv('DATABASE_URL_UNPOOLED', url);
      database = drizzle({ client: neon(url) });
      holder.database = database;
      expect((await import('../../db')).db).toBe(database);
      [sitemap, seo] = await Promise.all([
        import('../../server/queries/sitemap'),
        import('../../server/queries/seo'),
      ]);
      await database
        .insert(user)
        .values(
          ownerIds.map((id) => ({
            id,
            name: 'Disposable SEO fixture',
            email: `${id}@example.invalid`,
          })),
        );
      await database
        .insert(creatorProfiles)
        .values(
          ownerIds.map((id, index) => ({
            userId: id,
            handle: `p15${index}_${short}`,
            displayName: `SEO creator ${index}`,
            bio: 'Original designs',
            status: index === 0 ? ('approved' as const) : ('pending' as const),
            isAdult: true,
          })),
        );
      await database
        .insert(themes)
        .values(
          themeIds.map((id, index) => ({
            id,
            slug: `p15-${id}`,
            nameEn: 'SEO fixture',
            source: 'admin' as const,
            status:
              index === 0
                ? ('published' as const)
                : index === 1
                  ? ('draft' as const)
                  : ('archived' as const),
            spec: renderSampleSpec(playgroundStateSchema.parse({})),
            specHash: 'a'.repeat(64),
            updatedAt: new Date('2026-01-02T03:04:05Z'),
          })),
        );
      await database
        .insert(tags)
        .values(
          tagIds.map((id, index) => ({
            id,
            slug: `p15-${index}-${short}`,
            nameEn: 'Custom SEO aesthetic',
            nameAr: 'ذوق مخصص',
            kind: index === 2 ? ('mood' as const) : ('aesthetic' as const),
            isActive: index !== 1,
          })),
        );
      await database
        .insert(collections)
        .values(
          collectionIds.map((id, index) => ({
            id,
            slug: index === 3 ? null : `p15-${index}-${short}`,
            titleEn: 'Public metadata title',
            titleAr: 'عنوان عربي',
            descriptionEn: 'Original collection',
            kind:
              index === 3
                ? ('user' as const)
                : index === 1
                  ? ('seasonal' as const)
                  : ('editorial' as const),
            visibility:
              index === 2
                ? ('private' as const)
                : index === 3
                  ? ('unlisted' as const)
                  : ('public' as const),
            ownerId: index === 3 ? ownerIds[0] : null,
            ...(index === 1
              ? { startsAt: new Date('2020-01-01Z'), endsAt: new Date('2020-02-01Z') }
              : {}),
          })),
        );
    }, 30_000);
    afterAll(async () => {
      try {
        if (database) {
          await database.delete(collections).where(inArray(collections.id, collectionIds));
          await database.delete(tags).where(inArray(tags.id, tagIds));
          await database.delete(themes).where(inArray(themes.id, themeIds));
          await database.delete(user).where(inArray(user.id, ownerIds));
        }
      } finally {
        vi.unstubAllEnvs();
      }
    }, 30_000);
    it('includes both public collection kinds outside schedule and excludes private/unpublished identities', async () => {
      const rows = await sitemap.readSitemapEntities(0),
        paths = new Set(rows.map((row) => row.path));
      for (const path of SITEMAP_STATIC_PATHS) expect(paths.has(path)).toBe(true);
      expect(paths.has(`/t/p15-${themeIds[0]}`)).toBe(true);
      expect(paths.has(`/t/p15-${themeIds[1]}`)).toBe(false);
      expect(paths.has(`/t/p15-${themeIds[2]}`)).toBe(false);
      expect(paths.has(`/a/p15-0-${short}`)).toBe(true);
      expect(paths.has(`/a/p15-1-${short}`)).toBe(false);
      expect(paths.has(`/a/p15-2-${short}`)).toBe(false);
      expect(paths.has(`/collections/p15-0-${short}`)).toBe(true);
      expect(paths.has(`/collections/p15-1-${short}`)).toBe(true);
      expect(paths.has(`/collections/p15-2-${short}`)).toBe(false);
      expect(paths.has(`/c/p150_${short}`)).toBe(true);
      expect(paths.has(`/c/p151_${short}`)).toBe(false);
      expect(rows.find((row) => row.path === `/t/p15-${themeIds[0]}`)?.lastModified).toBe(
        '2026-01-02T03:04:05.000000Z',
      );
      expect(await sitemap.countSitemapEntities()).toBeGreaterThanOrEqual(
        SITEMAP_STATIC_PATHS.length + 5,
      );
      expect(await sitemap.readSitemapEntities(2147483647)).toEqual([]);
      expect(holder.tag).toHaveBeenCalledWith('themes', 'taxonomy', 'collections');
    });
    it('returns only public collection and approved creator metadata, reflecting current edits', async () => {
      expect(await seo.getCollectionMetadata(`p15-0-${short}`)).toMatchObject({
        titleAr: 'عنوان عربي',
      });
      expect(await seo.getCollectionMetadata(`p15-1-${short}`)).not.toBeNull();
      expect(await seo.getCollectionMetadata(`p15-2-${short}`)).toBeNull();
      expect(await seo.getCreatorMetadata(`p150_${short}`)).toMatchObject({
        displayName: 'SEO creator 0',
      });
      expect(await seo.getCreatorMetadata(`p151_${short}`)).toBeNull();
      const id = collectionIds[0];
      if (!id) throw new Error('Missing collection fixture');
      await database
        .update(collections)
        .set({ titleEn: 'Edited title' })
        .where(eq(collections.id, id));
      expect(await seo.getCollectionMetadata(`p15-0-${short}`)).toMatchObject({
        titleEn: 'Edited title',
      });
    });
  },
);
