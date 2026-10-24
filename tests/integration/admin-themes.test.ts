import { randomUUID } from 'node:crypto';
import { neon, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { user } from '../../db/schema/auth';
import { themes } from '../../db/schema/themes';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { uploads, auditLog } from '../../db/schema/system';
import { collections, collectionItems } from '../../db/schema/collections';
import { creatorProfiles } from '../../db/schema/moderation';
import { playgroundStateSchema, renderSampleSpec } from '../../content/render-sample';
import { specHash } from '../../lib/render/hash';
import type { ThemeSpec } from '../../lib/render/spec';
import type { Actor } from '../../lib/theme-status';
import type { ObjectStorage } from '../../lib/validation/storage';
import type * as Services from '../../server/services/admin-themes';
import type * as Audit from '../../server/audit';
import type * as AccountService from '../../server/services/account';
import type * as ReviewQueries from '../../server/admin-queries/review';

vi.mock('server-only', () => ({}));
const holder = vi.hoisted(() => ({
  database: undefined as unknown,
  pooled: undefined as unknown,
  guard: vi.fn(),
}));
vi.mock('../../db/index', () => ({
  get db(): unknown {
    if (!holder.database) throw new Error('Test DB not ready');
    return holder.database;
  },
}));
vi.mock('../../db/pool', () => ({
  get dbPool(): unknown {
    if (!holder.pooled) throw new Error('Test pool not ready');
    return holder.pooled;
  },
}));
vi.mock('../../server/guards', () => ({ requireAdmin: holder.guard }));
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const token = randomUUID(),
  short = token.replaceAll('-', '').slice(0, 12),
  people = ['admin', 'admin2', 'owner', 'other', 'banned'].map((name) => `p13-${name}-${token}`);
const [adminId = '', admin2Id = '', ownerId = '', otherId = '', bannedId = ''] = people;
const admin = (id = adminId): Actor => ({
  kind: 'user',
  userId: id,
  role: 'admin',
  isCreator: false,
});
const taxonomy = Array.from({ length: 5 }, (_, i) => ({
  id: randomUUID(),
  slug: `p13-${short}-${i}`,
  kind: i < 2 ? ('aesthetic' as const) : ('mood' as const),
  nameEn: `Admin tag ${i}`,
  nameAr: `وسم ${i}`,
  isActive: i !== 4,
}));
const [aesthetic = '', otherAesthetic = '', mood = '', extraMood = '', inactive = ''] =
  taxonomy.map((tag) => tag.slug);
const taxonomyText = (slugs: string[]) =>
  taxonomy
    .filter((tag) => slugs.includes(tag.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((tag) => `${tag.slug} ${tag.nameEn} ${tag.nameAr}`)
    .join(' ');
const spec = renderSampleSpec(playgroundStateSchema.parse({}));
const themeIds = new Set<string>(),
  collectionIds = Array.from({ length: 3 }, () => randomUUID()),
  uploadIds = Array.from({ length: 6 }, () => randomUUID());
const [editorialId = '', seasonalId = '', privateId = ''] = collectionIds;
const creatorHandle = `p13_${short}`;

describe.skipIf(!TEST_DATABASE_URL)(
  'admin theme mutation transactions on isolated Neon fixtures',
  () => {
    let database: ReturnType<typeof drizzle>,
      pool: Pool | undefined,
      service: typeof Services,
      audit: typeof Audit,
      review: typeof ReviewQueries;
    beforeAll(async () => {
      const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
      database = drizzle({ client: neon(url) });
      pool = new Pool({ connectionString: url, max: 6, application_name: `p13-admin-${token}` });
      holder.database = database;
      holder.pooled = drizzlePool({ client: pool });
      holder.guard.mockResolvedValue({ user: { id: adminId, role: 'admin', banned: false } });
      expect((await import('../../db')).db).toBe(database);
      service = await import('../../server/services/admin-themes');
      audit = await import('../../server/audit');
      review = await import('../../server/admin-queries/review');
      await database.insert(user).values(
        people.map((id) => ({
          id,
          name: 'Disposable admin fixture',
          email: `${id}@example.invalid`,
          role: [adminId, admin2Id, bannedId].includes(id) ? 'admin' : 'user',
          banned: id === bannedId,
        })),
      );
      await database.insert(creatorProfiles).values({
        userId: ownerId,
        handle: creatorHandle,
        displayName: 'Fixture creator',
        status: 'approved',
        isAdult: true,
      });
      await database.insert(tags).values(taxonomy);
      await database.insert(collections).values([
        {
          id: editorialId,
          slug: `p13-editorial-${short}`,
          kind: 'editorial',
          visibility: 'public',
          titleEn: 'Fixture editorial',
        },
        {
          id: seasonalId,
          slug: `p13-seasonal-${short}`,
          kind: 'seasonal',
          visibility: 'private',
          titleEn: 'Fixture seasonal',
        },
        {
          id: privateId,
          kind: 'user',
          ownerId,
          titleEn: 'Personal collection',
          visibility: 'private',
        },
      ]);
      await database.insert(uploads).values(
        uploadIds.map((id, i) => ({
          id,
          ownerId: i === 2 ? adminId : i === 3 ? otherId : ownerId,
          status: i === 4 ? ('pending' as const) : ('ready' as const),
          incomingKey: `uploads/incoming/${i === 2 ? adminId : i === 3 ? otherId : ownerId}/${i === 5 ? 'avatars/' : ''}${id}`,
          fullKey:
            i === 5
              ? `avatars/${ownerId}/${'a'.repeat(64)}.webp`
              : `uploads/wallpapers/${id}/full.jpg`,
          contentType: 'image/jpeg',
        })),
      );
    });
    afterEach(() => vi.restoreAllMocks());
    afterAll(async () => {
      try {
        if (database) {
          if (themeIds.size) {
            await database
              .delete(auditLog)
              .where(inArray(auditLog.entityId, [...themeIds, ...collectionIds]));
            await database.delete(themes).where(inArray(themes.id, [...themeIds]));
          }
          await database.delete(collections).where(inArray(collections.id, collectionIds));
          await database.delete(uploads).where(inArray(uploads.id, uploadIds));
          await database.delete(tags).where(
            inArray(
              tags.id,
              taxonomy.map((tag) => tag.id),
            ),
          );
          await database.delete(user).where(inArray(user.id, people));
        }
      } finally {
        await pool?.end();
        holder.database = undefined;
        holder.pooled = undefined;
      }
    });
    async function fixture(
      status: typeof themes.$inferSelect.status = 'draft',
      source: typeof themes.$inferSelect.source = 'generated',
      owner: string | null = ownerId,
      design: ThemeSpec = spec,
    ) {
      const id = randomUUID();
      themeIds.add(id);
      await database.insert(themes).values({
        id,
        slug: `p13-${id}`,
        status,
        source,
        ownerId: owner,
        nameEn: 'Fixture theme',
        spec: design,
        specHash: await specHash(design),
        tagsText: taxonomyText([aesthetic, mood]),
      });
      await database
        .insert(themeTags)
        .values(
          taxonomy
            .filter((tag) => [aesthetic, mood].includes(tag.slug))
            .map((tag) => ({ themeId: id, tagId: tag.id })),
        );
      return id;
    }
    async function row(id: string) {
      const [value] = await database.select().from(themes).where(eq(themes.id, id));
      return value;
    }
    async function events(id: string) {
      return database.select().from(auditLog).where(eq(auditLog.entityId, id));
    }
    const editing = (id: string) => ({
      id,
      nameEn: 'Renamed by admin',
      tagSlugs: [aesthetic, mood],
      isFeatured: false,
    });
    const photo = (assetKey: string, lock: string | null = null): ThemeSpec => ({
      ...spec,
      wallpaper: { kind: 'image', assetKey, focalX: 0.3, focalY: 0.7, dim: 0.1 },
      lockWallpaper: lock
        ? { kind: 'image', assetKey: lock, focalX: 0.4, focalY: 0.6, dim: 0 }
        : null,
    });
    it('requires actual current DB admin privileges and rejects spoofed/system/banned principals', async () => {
      const id = await fixture();
      for (const actor of [
        admin(ownerId),
        admin(otherId),
        admin(bannedId),
        { kind: 'system' as const, label: 'cli' },
      ])
        await expect(
          service.adminSetFeatured({ ids: [id], featured: true }, actor),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        service.adminSetFeatured({ ids: [id], featured: true }, admin(`missing-${token}`)),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      expect((await row(id))?.isFeatured).toBe(false);
      expect(await events(id)).toHaveLength(0);
    });
    it('commits mixed bulk transitions independently and enforces source/owner state rules', async () => {
      const generated = await fixture(),
        creator = await fixture('draft', 'creator'),
        submitted = await fixture('pending_review', 'creator'),
        missing = randomUUID();
      const result = await service.adminTransitionThemes(
        { ids: [generated.toUpperCase(), creator, submitted, missing, generated], to: 'approved' },
        admin(),
      );
      expect(result.data).toEqual({
        count: 2,
        results: [
          { id: generated, ok: true },
          { id: creator, ok: false, code: 'INVALID_STATE' },
          { id: submitted, ok: true },
          { id: missing, ok: false, code: 'NOT_FOUND' },
        ],
      });
      expect((await row(generated))?.status).toBe('approved');
      expect((await row(creator))?.status).toBe('draft');
      expect((await row(submitted))?.reviewedBy).toBe(adminId);
      expect((await events(generated)).map((event) => event.action)).toEqual([
        'theme.status.approved',
      ]);
      const before = await row(generated);
      expect(
        (await service.adminTransitionThemes({ ids: [generated], to: 'approved' }, admin())).data
          .count,
      ).toBe(1);
      expect((await row(generated))?.updatedAt).toEqual(before?.updatedAt);
      expect(await events(generated)).toHaveLength(1);
      const foreign = await fixture('pending_review', 'creator'),
        owned = await fixture('pending_review', 'creator', adminId);
      expect(
        (await service.adminTransitionThemes({ ids: [foreign, owned], to: 'draft' }, admin())).data,
      ).toEqual({
        count: 1,
        results: [
          { id: foreign, ok: false, code: 'FORBIDDEN' },
          { id: owned, ok: true },
        ],
      });
    });
    it('refuses a delayed decision after actual creator withdrawal, revision and resubmission', async () => {
      const id = await fixture('pending_review', 'creator'),
        captured = await review.getAdminReviewItem(id),
        creator: Actor = { kind: 'user', userId: ownerId, role: 'user', isCreator: true };
      if (!captured) throw new Error('Missing captured submission');
      const authoring = await import('../../server/services/creator-themes');
      await authoring.withdrawTheme({ id }, creator);
      const changedSpec = renderSampleSpec(playgroundStateSchema.parse({ seed: 2027 }));
      await authoring.updateCreatorTheme(
        {
          id,
          spec: changedSpec,
          nameEn: 'Revised after staging',
          tagSlugs: [aesthetic, mood],
        },
        creator,
      );
      await authoring.submitTheme({ id }, creator);
      const current = await review.getAdminReviewItem(id),
        before = await row(id),
        auditBefore = await events(id);
      if (!current) throw new Error('Missing resubmission');
      expect(current.specHash).not.toBe(captured.specHash);
      expect(current.reviewVersion).not.toBe(captured.reviewVersion);
      for (const decision of [
        { to: 'approved' as const },
        { to: 'rejected' as const, reason: 'Review of the previous design' },
      ]) {
        const result = await service.adminTransitionThemes(
          { ids: [id], reviewVersion: captured.reviewVersion, ...decision },
          admin(),
        );
        expect(result.data).toEqual({ count: 0, results: [{ id, ok: false, code: 'CONFLICT' }] });
        expect(result.tags).toEqual([]);
      }
      expect(await row(id)).toEqual(before);
      expect(await events(id)).toEqual(auditBefore);
      expect(
        (
          await service.adminTransitionThemes(
            { ids: [id], to: 'approved', reviewVersion: current.reviewVersion },
            admin(),
          )
        ).data,
      ).toEqual({ count: 1, results: [{ id, ok: true }] });
      expect((await row(id))?.status).toBe('approved');
      expect(await events(id)).toHaveLength(auditBefore.length + 1);
    }, 20000);
    it('distinguishes same-spec resubmissions one microsecond apart despite equal JavaScript dates', async () => {
      const id = await fixture('pending_review', 'creator');
      await database
        .update(themes)
        .set({ submittedAt: sql`'2026-10-24T10:20:30.123001Z'::timestamptz` })
        .where(eq(themes.id, id));
      const captured = await review.getAdminReviewItem(id),
        first = await row(id);
      await database
        .update(themes)
        .set({ submittedAt: sql`'2026-10-24T10:20:30.123002Z'::timestamptz` })
        .where(eq(themes.id, id));
      const current = await review.getAdminReviewItem(id),
        second = await row(id);
      if (!captured || !current) throw new Error('Missing microsecond submission');
      expect(first?.submittedAt).toEqual(second?.submittedAt);
      expect(current.specHash).toBe(captured.specHash);
      expect(current.reviewVersion).not.toBe(captured.reviewVersion);
      expect(
        (
          await service.adminTransitionThemes(
            { ids: [id], to: 'approved', reviewVersion: captured.reviewVersion },
            admin(),
          )
        ).data.results[0],
      ).toEqual({ id, ok: false, code: 'CONFLICT' });
      expect(await row(id)).toEqual(second);
      expect(await events(id)).toHaveLength(0);
      expect(
        (
          await service.adminTransitionThemes(
            { ids: [id], to: 'approved', reviewVersion: current.reviewVersion },
            admin(),
          )
        ).data.count,
      ).toBe(1);
    }, 15000);
    it('keeps legacy pending-review identity stable across featured changes', async () => {
      const id = await fixture('pending_review', 'creator'),
        captured = await review.getAdminReviewItem(id);
      if (!captured) throw new Error('Missing pending submission');
      expect((await row(id))?.submittedAt).toBeNull();
      await service.adminSetFeatured({ ids: [id], featured: true }, admin());
      expect((await review.getAdminReviewItem(id))?.reviewVersion).toBe(captured.reviewVersion);
      expect(
        (
          await service.adminTransitionThemes(
            { ids: [id], to: 'approved', reviewVersion: captured.reviewVersion },
            admin(),
          )
        ).data.count,
      ).toBe(1);
      expect((await row(id))?.status).toBe('approved');
    });
    it('requires a fresh complete generated review item after featuring and retains fresh DB authorization', async () => {
      const id = await fixture(),
        captured = await review.getAdminReviewItem(id);
      if (!captured) throw new Error('Missing generated draft');
      await service.adminSetFeatured({ ids: [id], featured: true }, admin());
      const current = await review.getAdminReviewItem(id),
        before = await row(id);
      if (!current) throw new Error('Missing refreshed generated draft');
      expect(current.isFeatured).toBe(true);
      expect(current.spec).toEqual(captured.spec);
      expect(current.reviewVersion).not.toBe(captured.reviewVersion);
      expect(
        (
          await service.adminTransitionThemes(
            { ids: [id], to: 'approved', reviewVersion: captured.reviewVersion },
            admin(),
          )
        ).data.results[0],
      ).toEqual({ id, ok: false, code: 'CONFLICT' });
      expect(await row(id)).toEqual(before);
      expect((await events(id)).map((event) => event.action)).toEqual(['theme.featured']);
      const input = { ids: [id], to: 'approved' as const, reviewVersion: current.reviewVersion };
      for (const actor of [admin(ownerId), admin(bannedId)])
        await expect(service.adminTransitionThemes(input, actor)).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      expect((await service.adminTransitionThemes(input, admin())).data.count).toBe(1);
      expect((await row(id))?.status).toBe('approved');
      const committed = await row(id);
      expect((await service.adminTransitionThemes(input, admin())).data.results[0]).toEqual({
        id,
        ok: false,
        code: 'CONFLICT',
      });
      expect(await row(id)).toEqual(committed);
      expect((await events(id)).map((event) => event.action).sort()).toEqual([
        'theme.featured',
        'theme.status.approved',
      ]);
    }, 15000);
    it('records sanitized rejection and invalidates archived public dependencies including retry no-ops', async () => {
      const pending = await fixture('pending_review', 'creator'),
        published = await fixture('published', 'creator');
      await database
        .insert(collectionItems)
        .values({ collectionId: editorialId, themeId: published, position: 0 });
      expect(
        (
          await service.adminTransitionThemes(
            { ids: [pending], to: 'rejected', reason: '<b>Low contrast</b>\n revise' },
            admin(),
          )
        ).data.count,
      ).toBe(1);
      expect(await row(pending)).toMatchObject({
        status: 'rejected',
        rejectionReason: 'Low contrast revise',
      });
      const archived = await service.adminTransitionThemes(
        { ids: [published], to: 'archived' },
        admin(),
      );
      expect(archived.tags).toEqual(
        expect.arrayContaining([
          'themes',
          `theme:p13-${published}`,
          'collections',
          `collection:p13-editorial-${short}`,
          `creator:${creatorHandle}`,
        ]),
      );
      expect(
        (await service.adminTransitionThemes({ ids: [published], to: 'archived' }, admin())).tags,
      ).toEqual(archived.tags);
    });
    it('edits any status with canonical hashes, immutable publication metadata and correct stale semantics', async () => {
      const id = await fixture('published', 'creator');
      const hash = await specHash(spec);
      await database
        .update(themes)
        .set({ assetVersion: 3, assetsSpecHash: hash })
        .where(eq(themes.id, id));
      const changed = { ...spec, icons: { ...spec.icons, shadow: !spec.icons.shadow } };
      const result = await service.adminUpdateTheme(
        {
          ...editing(id),
          spec: changed,
          isFeatured: true,
          nameAr: 'اسم',
          descriptionEn: 'First\nSecond',
        },
        admin(),
      );
      expect(result.data).toEqual({ id, stale: true });
      expect(result.tags).toContain(`theme:p13-${id}`);
      expect(await row(id)).toMatchObject({
        slug: `p13-${id}`,
        ownerId,
        source: 'creator',
        status: 'published',
        assetVersion: 3,
        assetsSpecHash: hash,
        specHash: await specHash(changed),
        nameAr: 'اسم',
        isFeatured: true,
      });
      const before = await row(id),
        count = (await events(id)).length;
      await service.adminUpdateTheme(
        {
          ...editing(id),
          spec: changed,
          isFeatured: true,
          nameAr: 'اسم',
          descriptionEn: 'First\nSecond',
        },
        admin(),
      );
      expect((await row(id))?.updatedAt).toEqual(before?.updatedAt);
      expect(await events(id)).toHaveLength(count);
      const draft = await fixture();
      expect((await service.adminUpdateTheme(editing(draft), admin())).data.stale).toBe(false);
    });
    it('preserves existing photo keys including anonymous originals while restricting newly introduced purpose/ownership', async () => {
      const ownKey = `uploads/wallpapers/${uploadIds[0]}/full.jpg`,
        lockKey = `uploads/wallpapers/${uploadIds[1]}/full.jpg`,
        adminKey = `uploads/wallpapers/${uploadIds[2]}/full.jpg`;
      const id = await fixture('published', 'creator', ownerId, photo(ownKey));
      await service.adminUpdateTheme({ ...editing(id), spec: photo(lockKey, adminKey) }, admin());
      expect((await row(id))?.spec.wallpaper).toMatchObject({ kind: 'image', assetKey: lockKey });
      for (const key of [
        `uploads/wallpapers/${uploadIds[3]}/full.jpg`,
        `uploads/wallpapers/${uploadIds[4]}/full.jpg`,
        `avatars/${ownerId}/${'a'.repeat(64)}.webp`,
        `uploads/wallpapers/${randomUUID()}/full.jpg`,
      ])
        await expect(
          service.adminUpdateTheme({ ...editing(id), spec: photo(key) }, admin()),
        ).rejects.toMatchObject({ code: key.startsWith('avatars/') ? 'VALIDATION' : 'FORBIDDEN' });
      const old = `uploads/wallpapers/${randomUUID()}/full.jpg`,
        anonymous = await fixture('published', 'creator', null, photo(old));
      await service.adminUpdateTheme(
        {
          ...editing(anonymous),
          spec: {
            ...spec,
            lockWallpaper: { kind: 'image', assetKey: old, focalX: 0.5, focalY: 0.5, dim: 0 },
          },
        },
        admin(),
      );
      expect((await row(anonymous))?.spec.lockWallpaper).toMatchObject({ assetKey: old });
      await database
        .update(uploads)
        .set({ incomingKey: `uploads/incoming/${ownerId}/avatars/${uploadIds[0]}` })
        .where(eq(uploads.id, uploadIds[0] ?? ''));
      try {
        await expect(
          service.adminUpdateTheme({ ...editing(id), spec: photo(ownKey) }, admin()),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        await database
          .update(uploads)
          .set({ incomingKey: `uploads/incoming/${ownerId}/${uploadIds[0]}` })
          .where(eq(uploads.id, uploadIds[0] ?? ''));
      }
    });
    it('maintains exact active aesthetic taxonomy for edits and partial-success bulk tagging', async () => {
      const good = await fixture('published'),
        bad = await fixture();
      await database.delete(themeTags).where(eq(themeTags.themeId, bad));
      const result = await service.adminTagThemes(
        { ids: [good, bad], add: [extraMood], remove: [] },
        admin(),
      );
      expect(result.data).toEqual({
        count: 1,
        results: [
          { id: good, ok: true },
          { id: bad, ok: false, code: 'VALIDATION' },
        ],
      });
      expect((await row(good))?.tagsText).toContain('وسم 3');
      for (const change of [
        { add: [otherAesthetic], remove: [] },
        { add: [], remove: [aesthetic] },
        { add: [inactive], remove: [] },
      ])
        expect(
          (await service.adminTagThemes({ ids: [good], ...change }, admin())).data.results[0],
        ).toMatchObject({ ok: false, code: 'VALIDATION' });
      expect(
        (
          await service.adminTagThemes(
            { ids: [good], add: [otherAesthetic], remove: [aesthetic] },
            admin(),
          )
        ).data.count,
      ).toBe(1);
      const before = await row(good),
        count = (await events(good)).length;
      await service.adminTagThemes(
        { ids: [good], add: [otherAesthetic], remove: [aesthetic] },
        admin(),
      );
      expect((await row(good))?.updatedAt).toEqual(before?.updatedAt);
      expect(await events(good)).toHaveLength(count);
      await expect(
        service.adminUpdateTheme({ ...editing(good), tagSlugs: [inactive] }, admin()),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });
    it('serializes editorial/seasonal insertion positions, rejects private collections and unpublished themes', async () => {
      const ids = await Promise.all(Array.from({ length: 7 }, () => fixture('published')));
      const results = await Promise.all(
        ids.map((id, i) =>
          service.adminAddToCollection(
            { ids: [id], collectionId: seasonalId },
            admin(i % 2 ? admin2Id : adminId),
          ),
        ),
      );
      expect(results.every((result) => result.data.count === 1)).toBe(true);
      const members = await database
        .select()
        .from(collectionItems)
        .where(eq(collectionItems.collectionId, seasonalId))
        .orderBy(asc(collectionItems.position));
      expect(members.map((item) => item.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      const before = (
        await database.select().from(auditLog).where(eq(auditLog.entityId, seasonalId))
      ).length;
      expect(
        (await service.adminAddToCollection({ ids, collectionId: seasonalId }, admin())).data.count,
      ).toBe(7);
      expect(
        (await database.select().from(auditLog).where(eq(auditLog.entityId, seasonalId))).length,
      ).toBe(before);
      expect(
        (
          await service.adminAddToCollection(
            { ids: [ids[0] ?? ''], collectionId: privateId },
            admin(),
          )
        ).data.results[0],
      ).toMatchObject({ ok: false, code: 'FORBIDDEN' });
      const draft = await fixture();
      expect(
        (await service.adminAddToCollection({ ids: [draft], collectionId: seasonalId }, admin()))
          .data.results[0],
      ).toMatchObject({ ok: false, code: 'INVALID_STATE' });
    }, 30000);
    it('rolls back admin updates and independent bulk items if their audit insert fails', async () => {
      const id = await fixture();
      vi.spyOn(audit, 'auditInsert').mockImplementationOnce(() => {
        throw new Error('Injected audit failure');
      });
      await expect(service.adminUpdateTheme(editing(id), admin())).rejects.toThrow(
        'Injected audit failure',
      );
      expect((await row(id))?.nameEn).toBe('Fixture theme');
      expect(await events(id)).toHaveLength(0);
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(audit, 'auditInsert').mockImplementationOnce(() => {
        throw new Error('Injected audit failure');
      });
      expect(
        (await service.adminSetFeatured({ ids: [id], featured: true }, admin())).data.results[0],
      ).toMatchObject({ ok: false, code: 'INTERNAL' });
      expect((await row(id))?.isFeatured).toBe(false);
      expect(await events(id)).toHaveLength(0);
      expect(logged).toHaveBeenCalledWith({ scope: 'admin.theme.mutation', id, failed: true });
      expect(
        (await service.adminSetFeatured({ ids: [id], featured: true }, admin())).data.count,
      ).toBe(1);
      const before = await row(id);
      await service.adminSetFeatured({ ids: [id], featured: true }, admin());
      expect((await row(id))?.updatedAt).toEqual(before?.updatedAt);
      expect(await events(id)).toHaveLength(1);
    });
    it('serializes admin photo edits with owner deletion so newly referenced originals survive', async () => {
      const owner = `p13-race-${randomUUID()}`,
        oldUpload = randomUUID(),
        newUpload = randomUUID();
      people.push(owner);
      uploadIds.push(oldUpload, newUpload);
      await database
        .insert(user)
        .values({ id: owner, name: 'Disposable race owner', email: `${owner}@example.invalid` });
      const oldKey = `uploads/wallpapers/${oldUpload}/full.jpg`,
        newKey = `uploads/wallpapers/${newUpload}/full.jpg`;
      await database.insert(uploads).values(
        [oldUpload, newUpload].map((id) => ({
          id,
          ownerId: owner,
          status: 'ready' as const,
          incomingKey: `uploads/incoming/${owner}/${id}`,
          fullKey: `uploads/wallpapers/${id}/full.jpg`,
          contentType: 'image/jpeg',
        })),
      );
      const id = await fixture('published', 'creator', owner, photo(oldKey)),
        client = await pool?.connect();
      if (!client) throw new Error('Missing test pool');
      await client.query('BEGIN');
      await client.query('SELECT id FROM tags WHERE id = $1 FOR UPDATE', [taxonomy[0]?.id]);
      const editingPromise = service.adminUpdateTheme(
        { ...editing(id), spec: photo(newKey) },
        admin(),
      );
      async function waiting(table: string): Promise<boolean> {
        const until = Date.now() + 5000;
        while (Date.now() < until) {
          const result = await database.execute<{ waiting: boolean }>(
            sql`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${`p13-admin-${token}`} AND wait_event_type='Lock' AND query LIKE ${`%"${table}"%`}) AS waiting`,
          );
          if (result.rows[0]?.waiting) return true;
          await new Promise<void>((resolve) => setTimeout(resolve, 20));
        }
        return false;
      }
      let deletePromise:
          Promise<Awaited<ReturnType<typeof AccountService.deleteAccountAndContent>>> | undefined,
        editorWaiting = false,
        deletionWaiting = false;
      try {
        editorWaiting = await waiting('tags');
        const accountService = await import('../../server/services/account');
        deletePromise = accountService.deleteAccountAndContent(owner);
        deletionWaiting = await waiting('user');
      } finally {
        await client.query('COMMIT');
        client.release();
      }
      const [, plan] = await Promise.all([editingPromise, deletePromise]);
      expect(editorWaiting).toBe(true);
      expect(deletionWaiting).toBe(true);
      expect(plan?.keys).toContain(oldKey);
      expect(plan?.keys).not.toContain(newKey);
      expect(await row(id)).toMatchObject({
        ownerId: null,
        status: 'published',
        spec: { wallpaper: { kind: 'image', assetKey: newKey } },
      });
    }, 20000);
    it('preserves files on uncertain deletion commits and never emits a false failure audit', async () => {
      const id = await fixture(),
        pooled = holder.pooled as ReturnType<typeof drizzlePool>,
        original = pooled.transaction.bind(pooled);
      let calls = 0;
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(pooled, 'transaction').mockImplementation(async (...args) => {
        const result = await original(...args);
        if (++calls === 2) throw new Error('Lost commit acknowledgement');
        return result;
      });
      const result = await service.adminDeleteThemes({ ids: [id] }, admin());
      expect(result.data).toEqual({ count: 0, results: [{ id, ok: false, code: 'INTERNAL' }] });
      expect(result.cleanup).toBeUndefined();
      expect(await row(id)).toBeUndefined();
      expect((await events(id)).map((event) => event.action)).toEqual(['theme.deleted']);
    });
    it('deletes only nonpublished themes and cleans only confirmed absent generated prefixes, never upload originals', async () => {
      const draft = await fixture(),
        archived = await fixture('archived', 'creator'),
        published = await fixture('published', 'creator');
      const result = await service.adminDeleteThemes(
        { ids: [draft, archived, published] },
        admin(),
      );
      expect(result.data).toEqual({
        count: 2,
        results: [
          { id: draft, ok: true },
          { id: archived, ok: true },
          { id: published, ok: false, code: 'INVALID_STATE' },
        ],
      });
      expect(result.cleanup).toEqual({ themeIds: [draft, archived] });
      expect(await row(draft)).toBeUndefined();
      expect(await row(published)).toBeDefined();
      expect((await events(draft)).map((event) => event.action)).toEqual(['theme.deleted']);
      const deleted: string[] = [],
        storage: ObjectStorage = {
          put: vi.fn(),
          head: vi.fn(),
          getBytes: vi.fn(),
          deleteMany: vi.fn(),
          deletePrefix: async (prefix) => {
            deleted.push(prefix);
          },
          listPrefixes: vi.fn(),
          presignPut: vi.fn(),
        };
      await service.cleanupDeletedThemeAssets([draft, archived, published], storage);
      expect(deleted.sort()).toEqual([`themes/${draft}/`, `themes/${archived}/`].sort());
      expect(storage.deleteMany).not.toHaveBeenCalled();
      expect(
        await database.select().from(uploads).where(inArray(uploads.id, uploadIds)),
      ).toHaveLength(6);
    });
  },
);
