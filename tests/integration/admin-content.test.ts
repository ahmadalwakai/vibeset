import { randomUUID } from 'node:crypto';
import { neon, Pool, type PoolClient } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { user } from '../../db/schema/auth';
import { themes } from '../../db/schema/themes';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { apps } from '../../db/schema/catalog';
import { collections, collectionItems } from '../../db/schema/collections';
import { auditLog, siteSettings } from '../../db/schema/system';
import { renderSampleSpec, playgroundStateSchema } from '../../content/render-sample';
import { specHash } from '../../lib/render/hash';
import type { Actor } from '../../lib/theme-status';
import type * as CollectionService from '../../server/services/admin-collections';
import type * as TagService from '../../server/services/admin-tags';
import type * as AppService from '../../server/services/admin-apps';
import type * as ThemeService from '../../server/services/admin-themes';
import type * as Queries from '../../server/admin-queries/content';
import type * as Audit from '../../server/audit';
vi.mock('server-only', () => ({}));
const holder = vi.hoisted(() => ({
  database: undefined as unknown,
  pooled: undefined as unknown,
  guard: vi.fn(),
}));
vi.mock('../../db', () => ({
  get db(): unknown {
    if (!holder.database) throw new Error('Isolated test DB unavailable');
    return holder.database;
  },
}));
vi.mock('../../db/pool', () => ({
  get dbPool(): unknown {
    if (!holder.pooled) throw new Error('Isolated test pool unavailable');
    return holder.pooled;
  },
}));
vi.mock('../../server/guards', () => ({ requireAdmin: holder.guard }));
vi.mock('../../lib/env.client', () => ({
  env: { NEXT_PUBLIC_CDN_URL: 'https://cdn.example.invalid' },
}));
const testUrl = process.env.TEST_DATABASE_URL?.trim(),
  token = randomUUID().replaceAll('-', '').slice(0, 14),
  adminId = `p14-admin-${token}`,
  userId = `p14-user-${token}`;
const actor: Actor = { kind: 'user', userId: adminId, role: 'admin', isCreator: false };
const ownedTags = new Set<string>(),
  ownedThemes = new Set<string>(),
  ownedCollections = new Set<string>(),
  ownedApps = new Set<string>(),
  seedAudits = new Set<string>();
const design = renderSampleSpec(playgroundStateSchema.parse({}));
describe.skipIf(!testUrl)('admin content transactions on explicit isolated fixtures', () => {
  let db: ReturnType<typeof drizzle>, pool: Pool | undefined, lockClient: PoolClient | undefined;
  let cs: typeof CollectionService,
    ts: typeof TagService,
    as: typeof AppService,
    themesService: typeof ThemeService,
    queries: typeof Queries,
    audit: typeof Audit;
  let originalHero: typeof siteSettings.$inferSelect | undefined,
    heroTime: string | null = null;
  beforeAll(async () => {
    expect(process.env.VERCEL_ENV).not.toBe('production');
    const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(testUrl),
      host = (value: string) => new URL(value).hostname.replace(/-pooler(?=\.)/, '');
    for (const ordinary of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED])
      if (ordinary) expect(host(url)).not.toBe(host(ordinary));
    vi.stubEnv('DATABASE_URL', url);
    vi.stubEnv('DATABASE_URL_UNPOOLED', url);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VERCEL_ENV', undefined);
    db = drizzle({ client: neon(url) });
    pool = new Pool({ connectionString: url, max: 7, application_name: `p14-content-${token}` });
    holder.database = db;
    holder.pooled = drizzlePool({ client: pool });
    holder.guard.mockResolvedValue({ user: { id: adminId, role: 'admin', banned: false } });
    expect((await import('../../db')).db).toBe(db);
    [cs, ts, as, themesService, queries, audit] = await Promise.all([
      import('../../server/services/admin-collections'),
      import('../../server/services/admin-tags'),
      import('../../server/services/admin-apps'),
      import('../../server/services/admin-themes'),
      import('../../server/admin-queries/content'),
      import('../../server/audit'),
    ]);
    await db.insert(user).values([
      { id: adminId, email: `${adminId}@example.invalid`, name: 'Content admin', role: 'admin' },
      { id: userId, email: `${userId}@example.invalid`, name: 'Content user' },
    ]);
    lockClient = await pool.connect();
    await lockClient.query('SELECT pg_advisory_lock(914014,1)');
    [originalHero] = await db.select().from(siteSettings).where(eq(siteSettings.key, 'home.hero'));
    const clock = await db.execute<{ value: string }>(
      sql`SELECT to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS value FROM site_settings WHERE key='home.hero'`,
    );
    heroTime = clock.rows[0]?.value ?? null;
  }, 60000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try {
      if (db) {
        const [current] = await db
          .select()
          .from(siteSettings)
          .where(eq(siteSettings.key, 'home.hero'));
        if (current?.updatedBy === adminId) {
          if (originalHero)
            await db
              .update(siteSettings)
              .set({
                value: originalHero.value,
                updatedBy: originalHero.updatedBy,
                updatedAt: heroTime ? sql`${heroTime}::timestamptz` : originalHero.updatedAt,
              })
              .where(eq(siteSettings.key, 'home.hero'));
          else
            await db
              .delete(siteSettings)
              .where(and(eq(siteSettings.key, 'home.hero'), eq(siteSettings.updatedBy, adminId)));
        }
        await db
          .delete(auditLog)
          .where(
            or(
              eq(auditLog.actorId, adminId),
              seedAudits.size ? inArray(auditLog.id, [...seedAudits]) : undefined,
            ),
          );
        if (ownedCollections.size)
          await db.delete(collections).where(inArray(collections.id, [...ownedCollections]));
        if (ownedThemes.size) await db.delete(themes).where(inArray(themes.id, [...ownedThemes]));
        if (ownedTags.size) await db.delete(tags).where(inArray(tags.id, [...ownedTags]));
        if (ownedApps.size) await db.delete(apps).where(inArray(apps.id, [...ownedApps]));
        await db.delete(user).where(inArray(user.id, [adminId, userId]));
      }
    } finally {
      if (lockClient) {
        await lockClient.query('SELECT pg_advisory_unlock(914014,1)');
        lockClient.release();
      }
      await pool?.end();
      const runtime = await import('../../db/pool');
      if ('pool' in runtime && runtime.pool !== pool) await runtime.pool.end();
      vi.unstubAllEnvs();
      holder.database = undefined;
      holder.pooled = undefined;
    }
  }, 20000);
  async function tag(kind: 'aesthetic' | 'mood' = 'mood', name = 'Tag') {
    const id = randomUUID(),
      slug = `p14-${token}-${id.slice(0, 8)}`;
    ownedTags.add(id);
    await db.insert(tags).values({ id, slug, kind, nameEn: name, nameAr: `وسم ${name}` });
    return { id, slug, kind, nameEn: name, nameAr: `وسم ${name}`, sortOrder: 0, isActive: true };
  }
  async function theme(
    tagIds: string[] = [],
    status: typeof themes.$inferSelect.status = 'published',
  ) {
    const id = randomUUID();
    ownedThemes.add(id);
    await db.insert(themes).values({
      id,
      slug: `p14-${id}`,
      source: 'generated',
      status,
      nameEn: 'Content theme',
      spec: design,
      specHash: await specHash(design),
      ownerId: userId,
    });
    if (tagIds.length)
      await db.insert(themeTags).values(tagIds.map((tagId) => ({ themeId: id, tagId })));
    return id;
  }
  const collectionInput = (slug: string) => ({
    slug,
    kind: 'editorial' as const,
    visibility: 'public' as const,
    titleEn: 'Content collection',
    isPinned: false,
    sortOrder: 0,
  });
  async function collection() {
    const result = await cs.adminUpsertCollection(collectionInput(`p14-${randomUUID()}`), actor);
    ownedCollections.add(result.data.id);
    return result.data.id;
  }
  async function logs(id: string) {
    return db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.actorId, adminId), eq(auditLog.entityId, id)));
  }
  it('rechecks current database admin and ban state for every mutation family', async () => {
    for (const call of [
      () => cs.adminUpsertCollection(collectionInput(`p14-${randomUUID()}`), { ...actor, userId }),
      () =>
        ts.adminUpsertTag(
          {
            slug: `p14-${token}-denied`,
            kind: 'mood',
            nameEn: 'Denied',
            nameAr: 'مرفوض',
            sortOrder: 0,
            isActive: true,
          },
          { ...actor, userId },
        ),
      () => as.adminDeleteApp({ id: randomUUID() }, { ...actor, userId }),
    ])
      await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db.update(user).set({ banned: true }).where(eq(user.id, adminId));
    try {
      await expect(collection()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    } finally {
      await db.update(user).set({ banned: false }).where(eq(user.id, adminId));
    }
  });
  it('rewrites and clears matching Home hero references atomically with collection rename/deletion', async () => {
    const id = await collection(),
      [before] = await db.select().from(collections).where(eq(collections.id, id));
    if (!before?.slug) throw new Error('Missing collection');
    await db
      .insert(siteSettings)
      .values({ key: 'home.hero', value: { collectionSlug: before.slug }, updatedBy: adminId })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: { collectionSlug: before.slug }, updatedBy: adminId },
      });
    const next = `${before.slug}-renamed`,
      result = await cs.adminUpsertCollection({ ...collectionInput(next), id }, actor);
    expect(result.tags).toEqual(
      expect.arrayContaining([
        'collections',
        `collection:${before.slug}`,
        `collection:${next}`,
        'settings',
      ]),
    );
    expect(
      (await db.select().from(siteSettings).where(eq(siteSettings.key, 'home.hero')))[0],
    ).toMatchObject({ value: { collectionSlug: next }, updatedBy: adminId });
    await cs.adminDeleteCollection({ id }, actor);
    expect(
      (await db.select().from(siteSettings).where(eq(siteSettings.key, 'home.hero')))[0]?.value,
    ).toEqual({ collectionSlug: null });
    expect(
      (await logs('home.hero')).filter((row) => row.action === 'settings.updated'),
    ).toHaveLength(2);
  });
  it('keeps hidden members in the exact full order, compacts removals and rejects personal collection edits', async () => {
    const id = await collection(),
      published = await theme(),
      hidden = await theme([], 'archived'),
      third = await theme();
    await db.insert(collectionItems).values([
      { collectionId: id, themeId: published, position: 0 },
      { collectionId: id, themeId: hidden, position: 1 },
      { collectionId: id, themeId: third, position: 2 },
    ]);
    await expect(
      cs.adminReorderCollection({ collectionId: id, themeIds: [published, third] }, actor),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await cs.adminReorderCollection(
      { collectionId: id, themeIds: [third, hidden, published] },
      actor,
    );
    expect((await queries.getAdminCollection(id))?.items.map((row) => row.id)).toEqual([
      third,
      hidden,
      published,
    ]);
    await cs.adminRemoveCollectionItem({ collectionId: id, themeId: hidden }, actor);
    expect(
      (
        await db
          .select()
          .from(collectionItems)
          .where(eq(collectionItems.collectionId, id))
          .orderBy(asc(collectionItems.position))
      ).map((row) => row.position),
    ).toEqual([0, 1]);
    const personal = randomUUID();
    ownedCollections.add(personal);
    await db
      .insert(collections)
      .values({ id: personal, kind: 'user', ownerId: userId, titleEn: 'Private' });
    await expect(cs.adminDeleteCollection({ id: personal }, actor)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await queries.getAdminCollection(personal)).toBeNull();
  });
  it('merges same-kind memberships without duplicates and rebuilds bilingual full text atomically', async () => {
    const aesthetic = await tag('aesthetic'),
      from = await tag('mood', 'Oldneedle'),
      to = await tag('mood', 'Newneedle'),
      one = await theme([aesthetic.id, from.id]),
      two = await theme([aesthetic.id, from.id, to.id]);
    const result = await ts.adminMergeTags({ fromId: from.id, toId: to.id }, actor);
    expect(result.data).toEqual({ id: to.id, affectedThemes: 2 });
    const rows = await db
      .select()
      .from(themeTags)
      .where(inArray(themeTags.themeId, [one, two]));
    expect(rows.filter((row) => row.tagId === to.id)).toHaveLength(2);
    expect(rows.some((row) => row.tagId === from.id)).toBe(false);
    const found = await db
      .select({
        text: themes.tagsText,
        matches: sql<boolean>`${themes.searchVector} @@ websearch_to_tsquery('simple','Newneedle')`,
      })
      .from(themes)
      .where(inArray(themes.id, [one, two]));
    expect(
      found.every(
        (row) =>
          row.matches && row.text.includes('وسم Newneedle') && !row.text.includes('Oldneedle'),
      ),
    ).toBe(true);
    expect((await logs(to.id)).at(-1)?.action).toBe('tag.merged');
  });
  it('rejects invalid merges, used aesthetic removal, changed kinds and stale removal confirmations', async () => {
    const aesthetic = await tag('aesthetic'),
      mood = await tag(),
      other = await tag(),
      id = await theme([aesthetic.id, mood.id]);
    await expect(
      ts.adminMergeTags({ fromId: mood.id, toId: aesthetic.id }, actor),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await db.update(tags).set({ isActive: false }).where(eq(tags.id, other.id));
    await expect(
      ts.adminMergeTags({ fromId: mood.id, toId: other.id }, actor),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      ts.adminDeleteTag({ id: aesthetic.id, removeFromThemes: true, expectedUsageCount: 1 }, actor),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(ts.adminUpsertTag({ ...mood, kind: 'season' }, actor)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(
      ts.adminDeleteTag({ id: mood.id, removeFromThemes: true, expectedUsageCount: 0 }, actor),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await ts.adminDeleteTag({ id: mood.id, removeFromThemes: true, expectedUsageCount: 1 }, actor);
    expect((await db.select().from(themes).where(eq(themes.id, id)))[0]?.tagsText).not.toContain(
      mood.slug,
    );
    expect(
      (await db.select().from(themeTags).where(eq(themeTags.themeId, id))).map((row) => row.tagId),
    ).toEqual([aesthetic.id]);
  });
  it('serializes tag additions before a merge captures its affected membership set', async () => {
    const aesthetic = await tag('aesthetic'),
      from = await tag('mood', 'Concurrentold'),
      to = await tag('mood', 'Concurrentnew'),
      id = await theme([aesthetic.id]);
    const client = await pool?.connect();
    if (!client) throw new Error('Missing pool');
    await client.query('BEGIN');
    await client.query('SELECT id FROM tags WHERE id=$1 FOR UPDATE', [from.id]);
    const addition = themesService.adminTagThemes(
      { ids: [id], add: [from.slug], remove: [] },
      actor,
    );
    async function waiting(fragment: string): Promise<boolean> {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const value = await db.execute<{ waiting: boolean }>(
          sql`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${`p14-content-${token}`} AND wait_event_type='Lock' AND query LIKE ${`%${fragment}%`}) AS waiting`,
        );
        if (value.rows[0]?.waiting) return true;
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
      }
      return false;
    }
    let merge: ReturnType<typeof ts.adminMergeTags> | undefined,
      additionWait = false,
      mergeWait = false;
    try {
      additionWait = await waiting('"tags"');
      merge = ts.adminMergeTags({ fromId: from.id, toId: to.id }, actor);
      mergeWait = await waiting('pg_advisory_xact_lock(');
    } finally {
      await client.query('COMMIT');
      client.release();
    }
    const [added, merged] = await Promise.all([addition, merge]);
    expect(additionWait).toBe(true);
    expect(mergeWait).toBe(true);
    expect(added.data.count).toBe(1);
    expect(merged?.data.affectedThemes).toBe(1);
    expect(
      (await db.select().from(themeTags).where(eq(themeTags.themeId, id)))
        .map((row) => row.tagId)
        .sort(),
    ).toEqual([aesthetic.id, to.id].sort());
    expect((await db.select().from(themes).where(eq(themes.id, id)))[0]?.tagsText).toContain(
      'Concurrentnew',
    );
  }, 20000);
  it('restores seeded labels and associated search text together without reactivating the tag', async () => {
    const seeded = await tag('mood', 'Baselineword'),
      id = await theme([seeded.id]);
    await ts.adminUpsertTag(
      { ...seeded, nameEn: 'Changedword', nameAr: 'اسم معدّل', isActive: false },
      actor,
    );
    expect((await db.select().from(themes).where(eq(themes.id, id)))[0]?.tagsText).toContain(
      'Changedword',
    );
    const { seedTaxonomy } = await import('../../server/services/seed-content');
    const result = await seedTaxonomy({
      actor: { kind: 'system', label: 'p14-fixture' },
      rows: [{ ...seeded, id: 'fixture' }],
    });
    if (result.data.auditId) seedAudits.add(result.data.auditId);
    expect(result.data.changed).toBe(1);
    expect((await db.select().from(tags).where(eq(tags.id, seeded.id)))[0]?.isActive).toBe(false);
    const [current] = await db.select().from(themes).where(eq(themes.id, id));
    expect(current?.tagsText).toContain('Baselineword');
    expect(current?.tagsText).not.toContain('Changedword');
    const repeat = await seedTaxonomy({
      actor: { kind: 'system', label: 'p14-fixture' },
      rows: [{ ...seeded, id: 'fixture' }],
    });
    expect(repeat.data).toMatchObject({ changed: 0, auditId: null });
    expect((await db.select().from(themes).where(eq(themes.id, id)))[0]?.updatedAt).toEqual(
      current?.updatedAt,
    );
  });
  it('rolls back memberships and search text if the merge audit fails', async () => {
    const from = await tag(),
      to = await tag(),
      id = await theme([from.id]);
    vi.spyOn(audit, 'auditInsert').mockImplementationOnce(() => {
      throw new Error('Injected audit failure');
    });
    await expect(ts.adminMergeTags({ fromId: from.id, toId: to.id }, actor)).rejects.toThrow(
      'Injected audit failure',
    );
    expect((await db.select().from(themeTags).where(eq(themeTags.themeId, id)))[0]?.tagId).toBe(
      from.id,
    );
    expect(await db.select().from(tags).where(eq(tags.id, from.id))).toHaveLength(1);
  });
  it('validates manifest glyphs, persists private app metadata and keeps public DTOs minimal', async () => {
    const input = {
      slug: `p14-${token}-app`,
      name: 'Testapp',
      aliases: ['تطبيق'],
      category: 'utilities' as const,
      glyph: 'heart',
      iosScheme: 'example://',
      androidPackage: 'com.example.test',
      rank: 8,
      isActive: true,
    };
    const result = await as.adminUpsertApp(input, actor);
    ownedApps.add(result.data.id);
    expect((await queries.listAdminApps({ q: input.slug })).items[0]).toMatchObject({
      iosScheme: 'example://',
      androidPackage: 'com.example.test',
    });
    const before = (await db.select().from(apps).where(eq(apps.id, result.data.id)))[0];
    await as.adminUpsertApp({ ...input, id: result.data.id }, actor);
    expect((await db.select().from(apps).where(eq(apps.id, result.data.id)))[0]?.updatedAt).toEqual(
      before?.updatedAt,
    );
    await expect(
      as.adminUpsertApp({ ...input, slug: `${input.slug}-bad`, glyph: 'not-real-glyph' }, actor),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(as.adminReorderApps({ ids: [] }, actor)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await as.adminDeleteApp({ id: result.data.id }, actor);
    expect(await db.select().from(apps).where(eq(apps.id, result.data.id))).toHaveLength(0);
  });
  it('enforces the 500-item collection cap through the existing P13 add path', async () => {
    const id = await collection(),
      ids = Array.from({ length: 500 }, () => randomUUID());
    for (const themeId of ids) ownedThemes.add(themeId);
    await db.insert(themes).values(
      await Promise.all(
        ids.map(async (themeId) => ({
          id: themeId,
          slug: `p14-${themeId}`,
          source: 'generated' as const,
          status: 'draft' as const,
          nameEn: 'Capacity fixture',
          spec: design,
          specHash: await specHash(design),
        })),
      ),
    );
    await db
      .insert(collectionItems)
      .values(ids.map((themeId, position) => ({ collectionId: id, themeId, position })));
    const published = await theme(),
      result = await themesService.adminAddToCollection(
        { ids: [published], collectionId: id },
        actor,
      );
    expect(result.data.results[0]).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect((await queries.getAdminCollection(id))?.itemCount).toBe(500);
  }, 20000);
});
