import { randomUUID } from 'node:crypto';
import { neon, Pool } from '@neondatabase/serverless';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { user } from '../../db/schema/auth';
import { creatorProfiles } from '../../db/schema/moderation';
import { auditLog, uploads } from '../../db/schema/system';
import { themes } from '../../db/schema/themes';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { favorites, themeStatsDaily } from '../../db/schema/engagement';
import { playgroundStateSchema, renderSampleSpec } from '../../content/render-sample';
import { specHash } from '../../lib/render/hash';
import type { Actor } from '../../lib/theme-status';
import type * as Creators from '../../server/services/creators';
import type * as Authoring from '../../server/services/creator-themes';
import type * as Queries from '../../server/admin-queries/creator';
import type * as Audit from '../../server/audit';

vi.mock('server-only', () => ({}));
const holder = vi.hoisted(() => ({ database: undefined as unknown, pooled: undefined as unknown }));
const mocks = vi.hoisted(() => ({ features: vi.fn(), user: vi.fn(), creator: vi.fn() }));
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
vi.mock('../../server/services/settings', () => ({ getFeatures: mocks.features }));
vi.mock('../../server/guards', () => ({ requireUser: mocks.user, requireCreator: mocks.creator }));
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const token = randomUUID(),
  short = token.replaceAll('-', '').slice(0, 12);
const people = ['owner', 'other', 'admin', 'applicant', 'claim1', 'claim2', 'stats'].map(
  (name) => `p12-${name}-${token}`,
);
const [
  ownerId = '',
  otherId = '',
  adminId = '',
  applicantId = '',
  claim1 = '',
  claim2 = '',
  statsId = '',
] = people;
const actor = (id = ownerId, admin = false): Extract<Actor, { kind: 'user' }> => ({
  kind: 'user',
  userId: id,
  role: admin ? 'admin' : 'user',
  isCreator: true,
});
const handles = {
  owner: `p12o_${short}`,
  other: `p12x_${short}`,
  stats: `p12s_${short}`,
  apply: `p12a_${short}`,
};
const taxonomy = Array.from({ length: 4 }, (_, i) => ({
  id: randomUUID(),
  slug: `p12-${short}-${i}`,
  kind: i < 2 ? ('aesthetic' as const) : ('mood' as const),
  nameEn: `Tag ${i}`,
  nameAr: `وسم ${i}`,
  isActive: i !== 3,
}));
const aesthetic = taxonomy[0]?.slug ?? '',
  secondAesthetic = taxonomy[1]?.slug ?? '',
  mood = taxonomy[2]?.slug ?? '',
  inactive = taxonomy[3]?.slug ?? '';
const uploadIds = Array.from({ length: 6 }, () => randomUUID());
const [homeId = '', lockId = '', foreignId = '', pendingId = '', avatarId = '', fakeAvatarId = ''] =
  uploadIds;
const homeKey = `uploads/wallpapers/${homeId}/full.jpg`,
  lockKey = `uploads/wallpapers/${lockId}/full.jpg`;
const fixtureSpec = renderSampleSpec(playgroundStateSchema.parse({}));
const themeIds = new Set<string>();

describe.skipIf(!TEST_DATABASE_URL)(
  'creator authority, reviews and authoring on isolated fixtures',
  () => {
    let database: ReturnType<typeof drizzle>,
      pool: Pool | undefined,
      creators: typeof Creators,
      authoring: typeof Authoring,
      queries: typeof Queries,
      audit: typeof Audit;
    beforeAll(async () => {
      const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
      database = drizzle({ client: neon(url) });
      pool = new Pool({ connectionString: url, max: 6 });
      holder.database = database;
      holder.pooled = drizzlePool({ client: pool });
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://vibeset.example');
      vi.stubEnv('NEXT_PUBLIC_CDN_URL', 'https://cdn.vibeset.example');
      mocks.features.mockResolvedValue({
        creatorApplicationsOpen: true,
        uploadsEnabled: true,
        reportsEnabled: true,
      });
      creators = await import('../../server/services/creators');
      authoring = await import('../../server/services/creator-themes');
      queries = await import('../../server/admin-queries/creator');
      audit = await import('../../server/audit');
      await database.insert(user).values(
        people.map((id) => ({
          id,
          name: 'Disposable creator fixture',
          email: `${id}@example.invalid`,
          role: id === adminId ? 'admin' : 'user',
          emailVerified: true,
        })),
      );
      await database.insert(creatorProfiles).values(
        [
          [ownerId, handles.owner],
          [otherId, handles.other],
          [statsId, handles.stats],
        ].map(([id = '', handle = '']) => ({
          userId: id,
          handle,
          displayName: 'Fixture artist',
          isAdult: true,
          status: 'approved' as const,
        })),
      );
      await database.insert(tags).values(taxonomy);
      await database.insert(uploads).values(
        uploadIds.map((id, i) => ({
          id,
          ownerId: i === 2 ? otherId : ownerId,
          status: i === 3 ? ('pending' as const) : ('ready' as const),
          incomingKey: `uploads/incoming/${ownerId}/${i === 4 ? 'avatars/' : ''}${id}`,
          fullKey:
            i >= 4
              ? `avatars/${ownerId}/${(i === 4 ? 'a' : 'b').repeat(64)}.webp`
              : `uploads/wallpapers/${id}/full.jpg`,
          contentType: i >= 4 ? 'image/webp' : 'image/jpeg',
          width: i >= 4 ? 256 : 1080,
          height: i >= 4 ? 256 : 1920,
          bytes: 100,
        })),
      );
    });
    afterEach(() => vi.restoreAllMocks());
    afterAll(async () => {
      try {
        if (database) {
          const owned = await database
            .select({ id: themes.id })
            .from(themes)
            .where(inArray(themes.ownerId, people));
          for (const row of owned) themeIds.add(row.id);
          await database
            .delete(auditLog)
            .where(inArray(auditLog.entityId, [...people, ...themeIds]));
          if (themeIds.size) await database.delete(themes).where(inArray(themes.id, [...themeIds]));
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
        vi.unstubAllEnvs();
      }
    });
    function input() {
      return {
        spec: fixtureSpec,
        nameEn: 'Creator theme',
        nameAr: 'تصميم',
        descriptionEn: 'Original design',
        tagSlugs: [aesthetic, mood],
      };
    }
    async function create(principal = actor(), design = fixtureSpec) {
      const result = await authoring.createCreatorTheme({ ...input(), spec: design }, principal);
      themeIds.add(result.data.id);
      return result.data.id;
    }
    async function read(id: string) {
      const [row] = await database.select().from(themes).where(eq(themes.id, id));
      return row;
    }
    async function events(id: string) {
      return database.select().from(auditLog).where(eq(auditLog.entityId, id));
    }
    async function fixture(
      status: typeof themes.$inferSelect.status = 'draft',
      owner = ownerId,
      source: typeof themes.$inferSelect.source = 'creator',
    ) {
      const id = randomUUID();
      themeIds.add(id);
      await database.insert(themes).values({
        id,
        slug: `p12-${id}`,
        ownerId: owner,
        source,
        status,
        nameEn: 'Existing fixture',
        spec: fixtureSpec,
        specHash: await specHash(fixtureSpec),
      });
      return id;
    }
    it('applies, reviews, sanitizes reasons, reapplies and prevents suspended self-reactivation', async () => {
      const application = {
        handle: handles.apply,
        displayName: 'Applicant',
        bio: 'Original art',
        links: [],
        isAdult: true as const,
      };
      expect((await creators.applyForCreator(application, actor(applicantId))).data.status).toBe(
        'pending',
      );
      await expect(creators.applyForCreator(application, actor(applicantId))).rejects.toMatchObject(
        { code: 'INVALID_STATE' },
      );
      await expect(
        creators.reviewCreator({ userId: applicantId, decision: 'approve' }, actor()),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(
        (
          await creators.reviewCreator(
            { userId: applicantId, decision: 'reject', reason: '<b>Original work</b>' },
            actor(adminId, true),
          )
        ).data.status,
      ).toBe('rejected');
      expect(
        (await creators.checkHandle({ handle: handles.apply }, actor(applicantId))).data.available,
      ).toBe(true);
      await expect(
        creators.reviewCreator({ userId: applicantId, decision: 'approve' }, actor(adminId, true)),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      await creators.applyForCreator(application, actor(applicantId));
      const approved = await creators.reviewCreator(
        { userId: applicantId, decision: 'approve' },
        actor(adminId, true),
      );
      expect(approved).toMatchObject({
        data: { status: 'approved' },
        tags: ['themes', `creator:${handles.apply}`],
      });
      await creators.reviewCreator(
        { userId: applicantId, decision: 'suspend', reason: 'Terms violation' },
        actor(adminId, true),
      );
      await expect(creators.applyForCreator(application, actor(applicantId))).rejects.toMatchObject(
        { code: 'INVALID_STATE' },
      );
      await expect(create(actor(applicantId))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await creators.reviewCreator(
        { userId: applicantId, decision: 'approve' },
        actor(adminId, true),
      );
      const context = await creators.getCreatorContext(applicantId);
      expect(context).toMatchObject({ status: 'approved', rejectionReason: null, isAdult: true });
      expect(
        (await creators.checkHandle({ handle: handles.apply }, actor(applicantId))).data.available,
      ).toBe(true);
      expect(
        (await creators.checkHandle({ handle: handles.apply }, actor(otherId))).data.available,
      ).toBe(false);
      expect(context).not.toHaveProperty('reviewedBy');
    }, 30000);
    it('serializes concurrent handle claims and enforces the applications feature in the service', async () => {
      const application = {
        handle: `p12c_${short}`,
        displayName: 'Applicant',
        links: [],
        isAdult: true as const,
      };
      const claims = await Promise.allSettled([
        creators.applyForCreator(application, actor(claim1)),
        creators.applyForCreator(application, actor(claim2)),
      ]);
      expect(claims.filter((claim) => claim.status === 'fulfilled')).toHaveLength(1);
      expect(claims.find((claim) => claim.status === 'rejected')).toMatchObject({
        reason: { code: 'CONFLICT' },
      });
      mocks.features.mockResolvedValueOnce({ creatorApplicationsOpen: false });
      await expect(
        creators.applyForCreator({ ...application, handle: `p12z_${short}` }, actor(otherId)),
      ).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    });
    it('creates canonical private drafts, bilingual tags, exact taxonomy and transactional audit', async () => {
      const id = await create(),
        row = await read(id);
      expect(row).toMatchObject({
        source: 'creator',
        status: 'draft',
        ownerId,
        nameEn: 'Creator theme',
        nameAr: 'تصميم',
        assetVersion: 0,
        assets: null,
        specHash: await specHash(fixtureSpec),
      });
      expect(row?.tagsText).toContain('وسم');
      expect(await database.select().from(themeTags).where(eq(themeTags.themeId, id))).toHaveLength(
        2,
      );
      expect((await events(id)).map((event) => event.action)).toEqual(['theme.created']);
      for (const tagSlugs of [
        [aesthetic, secondAesthetic],
        [mood],
        [aesthetic, inactive],
        [aesthetic, 'missing-tag'],
      ])
        await expect(
          authoring.createCreatorTheme({ ...input(), tagSlugs }, actor()),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
    });
    it('authorizes both home and lock photos by owned READY upload purpose and fresh role', async () => {
      const design = {
        ...fixtureSpec,
        wallpaper: { kind: 'image' as const, assetKey: homeKey, focalX: 0.5, focalY: 0.5, dim: 0 },
        lockWallpaper: {
          kind: 'image' as const,
          assetKey: lockKey,
          focalX: 0.5,
          focalY: 0.5,
          dim: 0,
        },
      };
      expect((await read(await create(actor(), design)))?.spec).toEqual(design);
      await database
        .update(uploads)
        .set({ incomingKey: `uploads/incoming/${ownerId}/avatars/${homeId}` })
        .where(eq(uploads.id, homeId));
      try {
        await expect(create(actor(), design)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        await database
          .update(uploads)
          .set({ incomingKey: `uploads/incoming/${ownerId}/${homeId}` })
          .where(eq(uploads.id, homeId));
      }
      for (const key of [
        `uploads/wallpapers/${foreignId}/full.jpg`,
        `uploads/wallpapers/${pendingId}/full.jpg`,
        `uploads/wallpapers/${randomUUID()}/full.jpg`,
      ])
        await expect(
          create(actor(), { ...design, lockWallpaper: { ...design.lockWallpaper, assetKey: key } }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await database
        .update(creatorProfiles)
        .set({ status: 'suspended' })
        .where(eq(creatorProfiles.userId, ownerId));
      try {
        await expect(
          create({ ...actor(), role: 'admin', isCreator: true }, design),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        await database
          .update(creatorProfiles)
          .set({ status: 'approved' })
          .where(eq(creatorProfiles.userId, ownerId));
      }
      const adminDraft = await create(actor(adminId, true));
      await expect(
        authoring.submitTheme({ id: adminDraft }, actor(adminId, true)),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
    it('atomically submits/withdraws and edits rejected themes through the shared state machine', async () => {
      const id = await create();
      expect((await authoring.submitTheme({ id }, actor())).data.status).toBe('pending_review');
      expect((await read(id))?.submittedAt).toBeInstanceOf(Date);
      await expect(authoring.updateCreatorTheme({ id, ...input() }, actor())).rejects.toMatchObject(
        { code: 'INVALID_STATE' },
      );
      expect((await authoring.withdrawTheme({ id }, actor())).data.status).toBe('draft');
      expect((await read(id))?.submittedAt).toBeNull();
      await expect(authoring.withdrawTheme({ id }, actor())).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
      await database
        .update(themes)
        .set({ status: 'rejected', rejectionReason: 'Fix contrast' })
        .where(eq(themes.id, id));
      await authoring.updateCreatorTheme({ id, ...input(), nameEn: 'Revised' }, actor());
      expect(await read(id)).toMatchObject({
        status: 'draft',
        nameEn: 'Revised',
        rejectionReason: null,
      });
      const records = await events(id);
      expect(records.map((record) => record.action)).toContain('theme.status.draft');
      const before = await read(id),
        count = records.length;
      await authoring.updateCreatorTheme({ id, ...input(), nameEn: 'Revised' }, actor());
      expect((await read(id))?.updatedAt).toEqual(before?.updatedAt);
      expect(await events(id)).toHaveLength(count);
    });
    it('rejects missing/inactive aesthetics at submit and foreign/noneditable draft operations', async () => {
      const noTags = await fixture();
      await expect(authoring.submitTheme({ id: noTags }, actor())).rejects.toMatchObject({
        code: 'VALIDATION',
      });
      const id = await create();
      for (const intruder of [actor(otherId), actor(adminId, true)]) {
        await expect(
          authoring.updateCreatorTheme({ id, ...input() }, intruder),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(authoring.deleteCreatorTheme({ id }, intruder)).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });
      }
      await database.update(tags).set({ isActive: false }).where(eq(tags.slug, aesthetic));
      try {
        await expect(authoring.submitTheme({ id }, actor())).rejects.toMatchObject({
          code: 'VALIDATION',
        });
      } finally {
        await database.update(tags).set({ isActive: true }).where(eq(tags.slug, aesthetic));
      }
      for (const status of ['pending_review', 'approved', 'published', 'archived'] as const) {
        const fixed = await fixture(status);
        await expect(authoring.deleteCreatorTheme({ id: fixed }, actor())).rejects.toMatchObject({
          code: 'INVALID_STATE',
        });
      }
      const remix = await fixture('draft', ownerId, 'remix');
      await authoring.updateCreatorTheme({ id: remix, ...input() }, actor());
      expect((await authoring.submitTheme({ id: remix }, actor())).data.status).toBe(
        'pending_review',
      );
    }, 30000);
    it('validates avatar ownership and purpose, invalidates embedded attribution, and suppresses no-op churn', async () => {
      const profile = {
        displayName: 'Updated artist',
        bio: 'New bio',
        links: [{ label: 'Portfolio', url: 'https://example.com' }],
        avatarUploadId: avatarId,
      };
      expect((await creators.updateCreatorProfile(profile, actor())).tags).toEqual([
        'themes',
        `creator:${handles.owner}`,
      ]);
      const before = await creators.getCreatorContext(ownerId),
        count = (await events(ownerId)).length;
      expect(before?.avatarUrl).toContain(`avatars/${ownerId}/`);
      await creators.updateCreatorProfile(profile, actor());
      expect((await creators.getCreatorContext(ownerId))?.updatedAt).toBe(before?.updatedAt);
      expect(await events(ownerId)).toHaveLength(count);
      for (const avatarUploadId of [homeId, fakeAvatarId, foreignId, pendingId])
        await expect(
          creators.updateCreatorProfile({ ...profile, avatarUploadId }, actor()),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await database
        .update(uploads)
        .set({
          incomingKey: `uploads/incoming/${ownerId}/avatars/${fakeAvatarId}`,
          fullKey: `avatars/${ownerId}/${'b'.repeat(64)}.webp\n`,
        })
        .where(eq(uploads.id, fakeAvatarId));
      await expect(
        creators.updateCreatorProfile({ ...profile, avatarUploadId: fakeAvatarId }, actor()),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
    it('rolls back rejected-to-draft edits and deletions when the mutation audit fails', async () => {
      const id = await create();
      await database
        .update(themes)
        .set({ status: 'rejected', rejectionReason: 'Revise' })
        .where(eq(themes.id, id));
      vi.spyOn(audit, 'auditInsert').mockImplementationOnce(() => {
        throw new Error('Injected creator audit failure');
      });
      await expect(
        authoring.updateCreatorTheme({ id, ...input(), nameEn: 'Rollback' }, actor()),
      ).rejects.toThrow('Injected creator audit failure');
      expect(await read(id)).toMatchObject({
        status: 'rejected',
        nameEn: 'Creator theme',
        rejectionReason: 'Revise',
      });
      expect((await events(id)).map((event) => event.action)).toEqual(['theme.created']);
      vi.spyOn(audit, 'auditInsert').mockImplementationOnce(() => {
        throw new Error('Injected creator audit failure');
      });
      await expect(authoring.deleteCreatorTheme({ id }, actor())).rejects.toThrow(
        'Injected creator audit failure',
      );
      expect(await read(id)).toBeDefined();
      await authoring.deleteCreatorTheme({ id }, actor());
      expect(await read(id)).toBeUndefined();
    });
    it('derives private dashboard statistics from real daily events and current published favourites', async () => {
      const published = await fixture('published', statsId),
        archived = await fixture('archived', statsId),
        foreign = await fixture('published', otherId);
      await database.update(themes).set({ favoriteCount: 999 }).where(eq(themes.id, published));
      await database.insert(favorites).values([
        { userId: otherId, themeId: published },
        { userId: otherId, themeId: archived },
      ]);
      const date = (ago: number) => {
        const day = new Date();
        day.setUTCDate(day.getUTCDate() - ago);
        return day.toISOString().slice(0, 10);
      };
      await database.insert(themeStatsDaily).values([
        {
          themeId: published,
          day: date(0),
          views: 5,
          downloads: 2,
          iconExports: 1,
          remixes: 2,
          setupCompletions: 3,
        },
        { themeId: published, day: date(6), views: 3, downloads: 1 },
        { themeId: published, day: date(29), views: 11 },
        { themeId: published, day: date(30), views: 100 },
        { themeId: published, day: date(-1), views: 200 },
        { themeId: foreign, day: date(0), views: 1000 },
      ]);
      mocks.creator.mockResolvedValue({
        user: { id: statsId, role: 'user' },
        creator: { status: 'approved' },
      });
      const week = await queries.getCreatorDashboard({ days: 7 });
      expect(week).toMatchObject({
        days: 7,
        currentFavorites: 1,
        counts: { published: 1, archived: 1 },
        stats: { views: 8, downloads: 3, iconExports: 1, remixes: 2, setupCompletions: 3 },
      });
      expect((await queries.getCreatorDashboard({ days: 30 })).stats.views).toBe(19);
      expect(week.topThemes.map((theme) => theme.id)).toEqual([published]);
      expect(await queries.getMyCreatorTheme(published)).toMatchObject({
        id: published,
        spec: fixtureSpec,
      });
      expect(await queries.getMyCreatorTheme(foreign)).toBeNull();
      expect(
        (await queries.listMyCreatorThemes({ status: 'published' })).items.map((row) => row.id),
      ).toEqual([published]);
      mocks.user.mockResolvedValue({ user: { id: statsId } });
      expect((await queries.getMyCreatorContext())?.handle).toBe(handles.stats);
    });
    it('paginates private rows with exact timestamp cursors and invokes guards before reads', async () => {
      const createdAt = new Date('2025-01-01T00:00:00.123Z');
      const rows = Array.from({ length: 26 }, () => {
        const id = randomUUID();
        themeIds.add(id);
        return {
          id,
          slug: `p12-page-${id}`,
          ownerId: statsId,
          source: 'creator' as const,
          status: 'rejected' as const,
          nameEn: 'Page fixture',
          spec: fixtureSpec,
          specHash: 'a'.repeat(64),
          createdAt,
        };
      });
      await database.insert(themes).values(rows);
      mocks.creator.mockResolvedValue({
        user: { id: statsId, role: 'user' },
        creator: { status: 'approved' },
      });
      const first = await queries.listMyCreatorThemes({ status: 'rejected' });
      expect(first.items).toHaveLength(24);
      expect(first.nextCursor).not.toBeNull();
      const second = await queries.listMyCreatorThemes({
        status: 'rejected',
        cursor: first.nextCursor ?? undefined,
      });
      expect(second.items).toHaveLength(2);
      expect(second.nextCursor).toBeNull();
      expect(new Set([...first.items, ...second.items].map(({ id }) => id)).size).toBe(26);
      const { AppError } = await import('../../server/errors');
      mocks.creator.mockRejectedValueOnce(new AppError('FORBIDDEN'));
      await expect(queries.getMyCreatorTheme(rows[0]?.id ?? randomUUID())).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
    it('uses current bans and serializes competing submissions without duplicate status audits', async () => {
      const id = await create();
      const attempts = await Promise.allSettled([
        authoring.submitTheme({ id }, actor()),
        authoring.submitTheme({ id }, actor()),
      ]);
      expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
      expect(
        (await events(id)).filter((event) => event.action === 'theme.status.pending_review'),
      ).toHaveLength(1);
      await database.update(user).set({ banned: true }).where(eq(user.id, ownerId));
      try {
        await expect(create()).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(authoring.withdrawTheme({ id }, actor())).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      } finally {
        await database.update(user).set({ banned: false }).where(eq(user.id, ownerId));
      }
    });
  },
);
