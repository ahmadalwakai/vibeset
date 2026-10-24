import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { playgroundStateSchema, renderSampleSpec } from '../../content/render-sample';
import { user } from '../../db/schema/auth';
import { apps } from '../../db/schema/catalog';
import { collectionItems, collections } from '../../db/schema/collections';
import { creatorProfiles } from '../../db/schema/moderation';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { themes } from '../../db/schema/themes';
import { CacheTags } from '../../lib/cache-tags';
import { specHash } from '../../lib/render/hash';
import type { ThemeAssets } from '../../lib/theme-assets';
import type * as ThemeQueries from '../../server/queries/themes';
import type * as CollectionQueries from '../../server/queries/collections';
import type * as CreatorQueries from '../../server/queries/creators';
import type * as TaxonomyQueries from '../../server/queries/taxonomy';
import type * as AppQueries from '../../server/queries/apps';

vi.mock('server-only', () => ({}));
const cacheCalls = vi.hoisted(() => ({ life: vi.fn(), tags: vi.fn() }));
vi.mock('../../server/cache', async () => ({
  CacheTags: (await import('../../lib/cache-tags')).CacheTags,
  cacheLife: cacheCalls.life,
  cacheTag: cacheCalls.tags,
}));
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const token = randomUUID().replaceAll('-', '').slice(0, 14);
const aesthetic = `p07-a-${token}`;
const mood = `p07-m-${token}`;
const inactive = `p07-i-${token}`;
const owner = `p07-owner-${token}`;
const pendingOwner = `p07-pending-${token}`;
const handle = `p07_${token}`;
const pendingHandle = `p07p_${token}`;
const ids: string[] = Array.from({ length: 32 }, () => randomUUID());
const tagIds = [randomUUID(), randomUUID(), randomUUID()];
const collectionIds: string[] = Array.from({ length: 7 }, () => randomUUID());
const appIds = [randomUUID(), randomUUID()];

describe.skipIf(!TEST_DATABASE_URL)(
  'public catalogue queries against isolated Neon fixtures',
  () => {
    let database: ReturnType<typeof drizzle>;
    let tq: typeof ThemeQueries;
    let cq: typeof CollectionQueries;
    let crq: typeof CreatorQueries;
    let tax: typeof TaxonomyQueries;
    let aq: typeof AppQueries;
    let seasonBoundary: number;
    const slug = (index: number) => `p07-${token}-${index}`;
    const collectionSlug = (index: number) => `p07-collection-${token}-${index}`;
    const spec = renderSampleSpec(
      playgroundStateSchema.parse({ kind: 'mesh', palette: 'lavender' }),
    );

    beforeAll(async () => {
      const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
      database = drizzle({ client: neon(url) });
      for (const [key, value] of Object.entries({
        DATABASE_URL: url,
        DATABASE_URL_UNPOOLED: url,
        NODE_ENV: 'test',
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
        NEXT_PUBLIC_CDN_URL: 'https://cdn.vibeset.example',
        BETTER_AUTH_URL: 'http://localhost:3000',
        BETTER_AUTH_SECRET: 'b'.repeat(32),
        IP_HASH_SALT: 'g'.repeat(32),
        CRON_SECRET: 'c'.repeat(32),
        INTERNAL_API_SECRET: 'i'.repeat(32),
      }))
        vi.stubEnv(key, value);
      vi.stubEnv('VERCEL_ENV', undefined);
      vi.stubEnv('SKIP_ENV_VALIDATION', undefined);
      [tq, cq, crq, tax, aq] = await Promise.all([
        import('../../server/queries/themes'),
        import('../../server/queries/collections'),
        import('../../server/queries/creators'),
        import('../../server/queries/taxonomy'),
        import('../../server/queries/apps'),
      ]);
      await database.insert(user).values([
        { id: owner, name: 'Public Artist', email: `${owner}@example.test` },
        { id: pendingOwner, name: 'Pending Artist', email: `${pendingOwner}@example.test` },
      ]);
      await database.insert(creatorProfiles).values([
        {
          userId: owner,
          handle,
          displayName: 'Public Artist',
          bio: 'Public biography',
          status: 'approved',
          isAdult: true,
          links: [{ label: 'Site', url: 'https://example.test/' }],
        },
        {
          userId: pendingOwner,
          handle: pendingHandle,
          displayName: 'Pending Artist',
          status: 'pending',
          isAdult: true,
        },
      ]);
      await database.insert(tags).values([
        {
          id: tagIds[0],
          slug: aesthetic,
          kind: 'aesthetic',
          nameEn: 'Fixture aesthetic',
          nameAr: 'جمالي',
          descriptionEn: 'A description',
          descriptionAr: 'وصف',
        },
        { id: tagIds[1], slug: mood, kind: 'mood', nameEn: 'Fixture mood', nameAr: 'مزاج' },
        {
          id: tagIds[2],
          slug: inactive,
          kind: 'style',
          nameEn: 'Hidden style',
          nameAr: 'مخفي',
          isActive: false,
        },
      ]);
      const prefix = `themes/${ids[0]}/v1/${randomUUID()}`;
      const assets: ThemeAssets = {
        version: 1,
        thumb: `${prefix}/thumb.webp`,
        previewHome: `${prefix}/preview-home.webp`,
        previewLock: `${prefix}/preview-lock.webp`,
        og: `${prefix}/og.jpg`,
        wallpapers: {
          phone: { key: `${prefix}/wallpaper-phone.jpg`, w: 1080, h: 2340, bytes: 12345 },
        },
      };
      const hash = await specHash(spec);
      await database.insert(themes).values(
        ids.map((id, index) => ({
          id,
          slug: slug(index),
          source: 'creator' as const,
          status: index === 31 ? ('draft' as const) : ('published' as const),
          ownerId: index === 30 ? pendingOwner : owner,
          nameEn: index === 0 ? 'Lavender' : `Fixture ${index}`,
          nameAr: index === 3 ? 'حرير ناعم' : `ثيم ${index}`,
          tagsText: index === 3 ? 'حرير ناعم' : 'fixture',
          spec,
          specHash: hash,
          colorFamily: index < 2 ? ('purple' as const) : ('blue' as const),
          popularity: index < 2 ? 500 : 100,
          downloadCount: index === 1 ? 500 : 100,
          publishedAt:
            index === 31 || index === 3
              ? null
              : index < 3
                ? sql`${`2026-10-24T12:00:00.00000${3 - index}Z`}::timestamptz`
                : new Date('2024-01-01T00:00:00Z'),
          createdAt:
            index === 3 ? new Date('2027-01-01T00:00:00Z') : new Date('2023-01-01T00:00:00Z'),
          assets:
            index === 0
              ? assets
              : index === 31
                ? { ...assets, thumb: `themes/${ids[31]}/v1/${randomUUID()}/thumb.webp` }
                : null,
        })),
      );
      await database
        .insert(themeTags)
        .values([
          ...ids.map((themeId) => ({ themeId, tagId: tagIds[0] as string })),
          ...ids.slice(0, 2).map((themeId) => ({ themeId, tagId: tagIds[1] as string })),
          { themeId: ids[0] as string, tagId: tagIds[2] as string },
        ]);
      await database
        .update(themes)
        .set({ remixOfId: ids[31] })
        .where(eq(themes.id, ids[0] as string));
      await database
        .update(themes)
        .set({ remixOfId: ids[0] })
        .where(eq(themes.id, ids[1] as string));
      const now = Date.now();
      seasonBoundary = now + 60_000;
      await database.insert(collections).values(
        collectionIds.map((id, index) => ({
          id,
          slug: collectionSlug(index),
          kind:
            index === 6
              ? ('user' as const)
              : index >= 2 && index <= 4
                ? ('seasonal' as const)
                : ('editorial' as const),
          visibility: index === 5 ? ('private' as const) : ('public' as const),
          ownerId: index === 6 ? owner : null,
          titleEn: `Collection ${index}`,
          isPinned: index === 0,
          coverThemeId: index === 0 ? ids[31] : ids[0],
          startsAt:
            index === 2
              ? new Date(now - 60_000)
              : index === 3
                ? new Date(now + 60_000)
                : index === 4
                  ? new Date(now - 120_000)
                  : null,
          endsAt:
            index === 2 ? new Date(now + 60_000) : index === 4 ? new Date(now - 60_000) : null,
        })),
      );
      await database.insert(collectionItems).values(
        ids.map((themeId, index) => ({
          collectionId: collectionIds[0] as string,
          themeId,
          position: Math.floor(index / 2),
        })),
      );
      await database.insert(apps).values([
        {
          id: appIds[0],
          slug: `p07-active-${token}`,
          name: 'Public App',
          category: 'utilities',
          glyph: 'star',
          isActive: true,
        },
        {
          id: appIds[1],
          slug: `p07-hidden-${token}`,
          name: 'Hidden App',
          category: 'utilities',
          glyph: 'star',
          isActive: false,
        },
      ]);
    }, 30_000);

    beforeEach(() => {
      cacheCalls.life.mockClear();
      cacheCalls.tags.mockClear();
    });
    afterAll(async () => {
      try {
        if (database) {
          await database.delete(collections).where(inArray(collections.id, collectionIds));
          await database.delete(themes).where(inArray(themes.id, ids));
          await database.delete(tags).where(inArray(tags.id, tagIds));
          await database.delete(apps).where(inArray(apps.id, appIds));
          await database.delete(user).where(inArray(user.id, [owner, pendingOwner]));
        }
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('uses stable sort-bound keysets for tied popularity and download values', async () => {
      for (const sort of ['trending', 'popular'] as const) {
        const found: string[] = [];
        let cursor: string | null = null;
        do {
          const page = await tq.listThemes({ tags: [aesthetic], sort, limit: 7, cursor });
          found.push(...page.items.map(({ id }) => id));
          cursor = page.nextCursor;
        } while (cursor);
        const expected = ids.slice(0, 31).sort((a, b) => {
          const ai = ids.indexOf(a);
          const bi = ids.indexOf(b);
          const av = sort === 'trending' ? (ai < 2 ? 500 : 100) : ai === 1 ? 500 : 100;
          const bv = sort === 'trending' ? (bi < 2 ? 500 : 100) : bi === 1 ? 500 : 100;
          return bv - av || b.localeCompare(a);
        });
        expect(found).toEqual(expected);
        expect(new Set(found).size).toBe(31);
      }
      expect(cacheCalls.tags).toHaveBeenCalledWith(CacheTags.themes, CacheTags.taxonomy);
      expect(cacheCalls.tags.mock.calls.flat()).toContain(CacheTags.creator(handle));
    });

    it('preserves microsecond timestamp ordering and createdAt fallback across pages', async () => {
      const found: string[] = [];
      let cursor: string | null = null;
      for (let index = 0; index < 4; index += 1) {
        const page = await tq.listThemes({ tags: [aesthetic], sort: 'new', limit: 1, cursor });
        found.push(...page.items.map(({ id }) => id));
        cursor = page.nextCursor;
      }
      expect(found).toEqual([ids[3], ids[0], ids[1], ids[2]]);
      const first = await tq.listThemes({ ids: [ids[3] as string], sort: 'new', limit: 1 });
      expect(first.items[0]?.publishedAt).toBeNull();
    });

    it('applies AND tags and colour while suppressing inactive tags', async () => {
      const page = await tq.listThemes({
        tags: [mood, aesthetic],
        color: 'purple',
        sort: 'popular',
        limit: 24,
      });
      expect(page.items.map(({ id }) => id)).toEqual([ids[1], ids[0]]);
      expect(page.items.flatMap(({ tags }) => tags.map(({ slug }) => slug))).not.toContain(
        inactive,
      );
      expect(
        (
          await tq.listThemes({
            tags: [aesthetic, mood],
            color: 'blue',
            sort: 'trending',
            limit: 24,
          })
        ).items,
      ).toEqual([]);
    });

    it('resolves all requested published IDs in first-occurrence order ignoring pagination and filters', async () => {
      const requested = [...ids].reverse();
      const page = await tq.listThemes({
        ids: [...requested, requested[0] as string],
        tags: ['unknown'],
        q: 'impossible',
        color: 'pink',
        sort: 'new',
        cursor: 'ignored',
        limit: 1,
      });
      expect(page.items.map(({ id }) => id)).toEqual(requested.filter((id) => id !== ids[31]));
      expect(page.nextCursor).toBeNull();
    });

    it('finds Arabic FTS text and a name typo through trigram matching', async () => {
      expect(
        (
          await tq.listThemes({ q: 'حرير', tags: [aesthetic], sort: 'trending', limit: 24 })
        ).items.map(({ id }) => id),
      ).toEqual([ids[3]]);
      expect(
        (
          await tq.listThemes({ q: 'Lavnder', tags: [aesthetic], sort: 'trending', limit: 24 })
        ).items.map(({ id }) => id),
      ).toEqual([ids[0]]);
    });

    it('limits ranked search to 200 results even with additional matches', async () => {
      const extraIds: string[] = Array.from({ length: 201 }, () => randomUUID());
      try {
        const hash = await specHash(spec);
        await database.insert(themes).values(
          extraIds.map((id) => ({
            id,
            slug: `p07-search-${id}`,
            source: 'generated' as const,
            status: 'published' as const,
            nameEn: `Searchcap ${token}`,
            spec,
            specHash: hash,
          })),
        );
        await database
          .insert(themeTags)
          .values(extraIds.map((themeId) => ({ themeId, tagId: tagIds[0] as string })));
        const found: string[] = [];
        let cursor: string | null = null;
        do {
          const page = await tq.listThemes({
            q: `Searchcap ${token}`,
            tags: [aesthetic],
            sort: 'trending',
            limit: 48,
            cursor,
          });
          found.push(...page.items.map(({ id }) => id));
          cursor = page.nextCursor;
        } while (cursor);
        expect(found).toHaveLength(200);
        expect(new Set(found).size).toBe(200);
        expect(found.every((id) => extraIds.includes(id))).toBe(true);
      } finally {
        await database.delete(themes).where(inArray(themes.id, extraIds));
      }
    }, 15_000);

    it('returns published details only and does not expose unpublished remix origins or unapproved creators', async () => {
      const first = await tq.getThemeDetail(slug(0));
      expect(first?.remixOf).toBeNull();
      const [stored] = await database
        .select({ updatedAt: themes.updatedAt })
        .from(themes)
        .where(eq(themes.id, ids[0] as string));
      expect(first?.updatedAt).toBe(stored?.updatedAt.toISOString());
      expect(first?.creator?.handle).toBe(handle);
      expect(first?.wallpapers.map(({ size }) => size)).toEqual(['phone']);
      expect((await tq.getThemeDetail(slug(1)))?.remixOf?.slug).toBe(slug(0));
      expect((await tq.getThemeDetail(slug(30)))?.creator).toBeNull();
      expect(await tq.getThemeDetail(slug(31))).toBeNull();
      expect(await tq.getThemeDetail(`missing-${token}`)).toBeNull();
      expect(JSON.stringify(first)).not.toContain(owner);
    });

    it('returns only related published themes and published top slugs', async () => {
      const related = await tq.getRelatedThemes({
        themeId: ids[0] as string,
        aestheticSlug: aesthetic,
      });
      expect(related).toHaveLength(12);
      expect(related.map(({ id }) => id)).not.toContain(ids[0]);
      expect(related.map(({ id }) => id)).not.toContain(ids[31]);
      const top = await tq.getTopThemeSlugs(50_000);
      expect(top).toContain(slug(0));
      expect(top).not.toContain(slug(31));
    });

    it('lists public editorials/active seasons and Home pinned editorials without exposing private/user collections', async () => {
      const own = (items: { id: string }[]) =>
        items
          .filter(({ id }) => collectionIds.includes(id))
          .map(({ id }) => collectionIds.indexOf(id))
          .sort();
      expect(own(await cq.listPublicCollections())).toEqual([0, 1, 2]);
      expect(own(await cq.getHomeCollections())).toEqual([0, 2]);
      expect(await cq.getCollection(collectionSlug(5))).toBeNull();
      expect(await cq.getCollection(collectionSlug(6))).toBeNull();
      expect((await cq.getCollection(collectionSlug(3)))?.id).toBe(collectionIds[3]);
      expect((await cq.getCollection(collectionSlug(4)))?.id).toBe(collectionIds[4]);
    });

    it('paginates collection position/id ascending and counts only published members', async () => {
      const first = await cq.getCollection(collectionSlug(0));
      expect(first?.itemCount).toBe(31);
      expect(first?.items.items).toHaveLength(24);
      expect(first?.items.nextCursor).toBeTruthy();
      const second = await cq.getCollection(collectionSlug(0), first?.items.nextCursor);
      const expected = ids
        .slice(0, 31)
        .sort(
          (a, b) =>
            Math.floor(ids.indexOf(a) / 2) - Math.floor(ids.indexOf(b) / 2) || a.localeCompare(b),
        );
      expect(
        [...(first?.items.items ?? []), ...(second?.items.items ?? [])].map(({ id }) => id),
      ).toEqual(expected);
      expect(second?.items.nextCursor).toBeNull();
      // A draft selected as cover must never expose its asset key.
      expect(first?.coverThumbUrl ?? '').not.toContain(`themes/${ids[31]}/`);
      expect((await cq.getCollection(collectionSlug(1)))?.coverThumbUrl).toContain(
        `themes/${ids[0]}/`,
      );
    });

    it('treats seasonal start as inclusive and end as exclusive', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(seasonBoundary);
      try {
        const listed = await cq.listPublicCollections();
        const found = listed.map(({ id }) => id);
        expect(found).not.toContain(collectionIds[2]);
        expect(found).toContain(collectionIds[3]);
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns approved creator profiles with 24/new pagination and published owned themes only', async () => {
      const profile = await crq.getCreatorPublic(handle);
      expect(profile?.bio).toBe('Public biography');
      expect(profile?.themes.items).toHaveLength(24);
      expect(profile?.themes.nextCursor).toBeTruthy();
      const next = await crq.getCreatorPublic(handle, profile?.themes.nextCursor);
      const found = [...(profile?.themes.items ?? []), ...(next?.themes.items ?? [])].map(
        ({ id }) => id,
      );
      expect(found).toHaveLength(30);
      expect(found).not.toContain(ids[30]);
      expect(found).not.toContain(ids[31]);
      expect(await crq.getCreatorPublic(pendingHandle)).toBeNull();
      expect(JSON.stringify(profile)).not.toContain('@example.test');
    });

    it('exposes active taxonomy/app projections and aesthetic descriptions only', async () => {
      const allTags = await tax.listTags();
      expect(allTags.map(({ slug }) => slug)).toContain(aesthetic);
      expect(allTags.map(({ slug }) => slug)).not.toContain(inactive);
      expect((await tax.listTags('mood')).filter(({ slug }) => slug === mood)).toHaveLength(1);
      expect(await tax.getAestheticTag(aesthetic)).toMatchObject({
        descriptionEn: 'A description',
        descriptionAr: 'وصف',
      });
      expect(await tax.getAestheticTag(mood)).toBeNull();
      const allApps = await aq.listApps();
      expect(allApps.map(({ slug }) => slug)).toContain(`p07-active-${token}`);
      expect(allApps.map(({ slug }) => slug)).not.toContain(`p07-hidden-${token}`);
      expect(
        Object.keys(allApps.find(({ slug }) => slug === `p07-active-${token}`) ?? {}).sort(),
      ).toEqual(['aliases', 'category', 'glyph', 'name', 'rank', 'slug']);
    });
  },
);
