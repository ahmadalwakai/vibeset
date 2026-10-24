import { randomUUID } from 'node:crypto';
import { neon, type Pool, type PoolClient } from '@neondatabase/serverless';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { user } from '../../db/schema/auth';
import { collections } from '../../db/schema/collections';
import { auditLog, generationRuns, siteSettings } from '../../db/schema/system';
import { defaultSettings } from '../../lib/settings';
import type { Actor } from '../../lib/theme-status';
import type * as SettingsService from '../../server/services/settings';
import type * as SettingsQueries from '../../server/admin-queries/settings';
import type * as GeneratorQueries from '../../server/admin-queries/generator';
import type * as AuditQueries from '../../server/admin-queries/audit';
import type * as CollectionsQueries from '../../server/queries/collections';
import { selectHomeCollections, selectHomeHero } from '../../lib/collection-window';

vi.mock('server-only', () => ({}));
const holder = vi.hoisted(() => ({
  database: undefined as unknown,
  guard: vi.fn(),
}));
vi.mock('../../db/index', () => ({
  get db(): unknown {
    if (!holder.database) throw new Error('Test DB not ready');
    return holder.database;
  },
}));
vi.mock('../../server/guards', () => ({ requireAdmin: holder.guard }));
vi.mock('../../server/cache', async () => ({
  CacheTags: (await import('../../lib/cache-tags')).CacheTags,
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock('../../lib/env.client', () => ({
  env: { NEXT_PUBLIC_CDN_URL: 'https://cdn.example.invalid' },
}));
const testUrl = process.env.TEST_DATABASE_URL?.trim();
const token = randomUUID(),
  short = token.replaceAll('-', '').slice(0, 12);
const adminId = `p14-ops-admin-${token}`,
  ordinaryId = `p14-ops-user-${token}`;
const actor: Actor = { kind: 'user', userId: adminId, role: 'admin', isCreator: false };
const keys = ['home.hero', 'home.announcement', 'features'];
const ids: string[] = Array.from({ length: 4 }, () => randomUUID());
const [publicId = '', seasonalId = '', privateId = '', userCollectionId = ''] = ids;
const slugs = {
  public: `p14-ops-public-${short}`,
  seasonal: `p14-ops-season-${short}`,
  private: `p14-ops-private-${short}`,
};
const runId = randomUUID(),
  auditId = randomUUID();

describe.skipIf(!testUrl)('admin operations on disposable isolated database fixtures', () => {
  let database: ReturnType<typeof drizzle>,
    pool: Pool | undefined,
    fixtureLock: PoolClient | undefined;
  let originalSettings: (typeof siteSettings.$inferSelect)[] | undefined;
  let service: typeof SettingsService,
    settings: typeof SettingsQueries,
    generator: typeof GeneratorQueries,
    audit: typeof AuditQueries,
    catalog: typeof CollectionsQueries;
  beforeAll(async () => {
    expect(process.env.VERCEL_ENV).not.toBe('production');
    const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(testUrl);
    const host = (value: string): string => new URL(value).hostname.replace(/-pooler(?=\.)/, '');
    for (const ordinary of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED])
      if (ordinary)
        expect(host(url), 'Live tests require a distinct endpoint').not.toBe(host(ordinary));
    // Exercise the configured production pool too. Concurrent Vitest dynamic imports can bypass
    // db/pool module mocks; every possible binding must still point only to the isolated endpoint.
    for (const [key, value] of Object.entries({
      DATABASE_URL: url,
      DATABASE_URL_UNPOOLED: url,
      NODE_ENV: 'test',
      BETTER_AUTH_URL: 'http://localhost:3000',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      BETTER_AUTH_SECRET: 'b'.repeat(32),
      IP_HASH_SALT: 'i'.repeat(32),
      CRON_SECRET: 'c'.repeat(32),
      INTERNAL_API_SECRET: 's'.repeat(32),
    }))
      vi.stubEnv(key, value);
    vi.stubEnv('VERCEL_ENV', undefined);
    database = drizzle({ client: neon(url) });
    pool = (await import('../../db/pool')).pool;
    holder.database = database;
    fixtureLock = await pool.connect();
    // Coordinate canonical-setting fixtures with the content suite, never production service locks.
    await fixtureLock.query('SELECT pg_advisory_lock(914014,1)');
    originalSettings = await database
      .select()
      .from(siteSettings)
      .where(inArray(siteSettings.key, keys));
    expect((await import('../../db')).db).toBe(database);
    holder.guard.mockResolvedValue({ user: { id: adminId, role: 'admin', banned: false } });
    [service, settings, generator, audit, catalog] = await Promise.all([
      import('../../server/services/settings'),
      import('../../server/admin-queries/settings'),
      import('../../server/admin-queries/generator'),
      import('../../server/admin-queries/audit'),
      import('../../server/queries/collections'),
    ]);
    await database.insert(user).values([
      {
        id: adminId,
        role: 'admin',
        name: 'Operations fixture',
        email: `${adminId}@example.invalid`,
      },
      {
        id: ordinaryId,
        role: 'user',
        name: 'Ordinary fixture',
        email: `${ordinaryId}@example.invalid`,
      },
    ]);
    await database.insert(collections).values([
      {
        id: publicId,
        slug: slugs.public,
        kind: 'editorial',
        visibility: 'public',
        titleEn: 'Fixture public',
        isPinned: true,
      },
      {
        id: seasonalId,
        slug: slugs.seasonal,
        kind: 'seasonal',
        visibility: 'public',
        titleEn: 'Fixture seasonal',
        startsAt: new Date('2040-01-01T00:00:00Z'),
        endsAt: new Date('2040-01-02T00:00:00Z'),
        isPinned: true,
      },
      {
        id: privateId,
        slug: slugs.private,
        kind: 'editorial',
        visibility: 'private',
        titleEn: 'Fixture private',
      },
      {
        id: userCollectionId,
        ownerId: ordinaryId,
        kind: 'user',
        visibility: 'public',
        titleEn: 'Fixture user',
      },
    ]);
    await database.insert(generationRuns).values({
      id: runId,
      aesthetic: `p14-${short}`,
      seed: 0,
      requested: 24,
      created: 2,
      skippedDuplicates: 3,
      skippedQa: 4,
      status: 'failed',
      actorId: adminId,
      log: Array.from({ length: 120 }, (_, index) => `line ${index} ${'x'.repeat(2500)}`),
    });
    await database.insert(auditLog).values({
      id: auditId,
      actorId: adminId,
      action: `p14._%${short}`,
      entityType: 'fixture',
      entityId: runId,
      meta: { safe: '<script>not HTML</script>' },
      createdAt: new Date('2039-12-31T23:59:59.999Z'),
    });
  }, 30_000);
  afterAll(async () => {
    try {
      if (database) {
        if (originalSettings) {
          await database.delete(siteSettings).where(inArray(siteSettings.key, keys));
          if (originalSettings.length) await database.insert(siteSettings).values(originalSettings);
        }
        await database.delete(auditLog).where(eq(auditLog.actorId, adminId));
        await database.delete(generationRuns).where(eq(generationRuns.id, runId));
        await database.delete(collections).where(inArray(collections.id, ids));
        await database.delete(user).where(inArray(user.id, [adminId, ordinaryId]));
      }
    } finally {
      if (fixtureLock) {
        await fixtureLock.query('SELECT pg_advisory_unlock(914014,1)');
        fixtureLock.release();
      }
      await pool?.end();
      vi.unstubAllEnvs();
    }
  }, 30_000);
  it('commits an exact setting with its before/after audit and public invalidation tag', async () => {
    const result = await service.updateSetting(
      'features',
      { creatorApplicationsOpen: false, uploadsEnabled: true, reportsEnabled: false },
      actor,
    );
    expect(result).toEqual({ data: { ok: true }, tags: ['settings'] });
    const [stored] = await database
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'features'));
    expect(stored?.value).toEqual({
      creatorApplicationsOpen: false,
      uploadsEnabled: true,
      reportsEnabled: false,
    });
    expect(stored?.updatedBy).toBe(adminId);
    const entries = await database
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.actorId, adminId), eq(auditLog.entityId, 'features')));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe('settings.updated');
    expect(entries[0]?.meta.after).toEqual(stored?.value);
  });
  it('serializes concurrent first/key writes so the later audit records the actual prior value', async () => {
    const make = (textEn: string) => ({
      ...defaultSettings['home.announcement'],
      enabled: true,
      textEn,
      textAr: 'إعلان تجريبي',
    });
    await service.updateSetting('home.announcement', make(`baseline-${short}`), actor);
    const outcomes = await Promise.allSettled([
      service.updateSetting('home.announcement', make(`first-${short}`), actor),
      service.updateSetting('home.announcement', make(`second-${short}`), actor),
    ]);
    expect(outcomes.map((value) => value.status)).toEqual(['fulfilled', 'fulfilled']);
    const entries = await database
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.actorId, adminId), eq(auditLog.entityId, 'home.announcement')));
    const pairs = z
      .array(
        z.object({
          meta: z.object({ before: z.unknown(), after: z.object({ textEn: z.string() }) }),
        }),
      )
      .parse(entries);
    const first = pairs.find((entry) => entry.meta.after.textEn === `first-${short}`);
    const second = pairs.find((entry) => entry.meta.after.textEn === `second-${short}`);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect([first?.meta.before, second?.meta.before]).toContainEqual(make(`baseline-${short}`));
    const priorTexts = [first?.meta.before, second?.meta.before].map(
      (value) => z.object({ textEn: z.string() }).parse(value).textEn,
    );
    expect(
      priorTexts.some((value) => value === `first-${short}` || value === `second-${short}`),
    ).toBe(true);
  });
  it('rechecks current admin and ban state inside the mutation rather than trusting actor claims', async () => {
    const before = await database
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, 'features'));
    for (const denied of [
      { ...actor, userId: ordinaryId } as Actor,
      { kind: 'system', label: 'cli' } as Actor,
    ])
      await expect(
        service.updateSetting('features', defaultSettings.features, denied),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await database.update(user).set({ banned: true }).where(eq(user.id, adminId));
    try {
      await expect(
        service.updateSetting('features', defaultSettings.features, actor),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    } finally {
      await database.update(user).set({ banned: false }).where(eq(user.id, adminId));
    }
    expect(
      await database.select().from(siteSettings).where(eq(siteSettings.key, 'features')),
    ).toEqual(before);
  });
  it('validates hero references before writing and allows scheduling a future public seasonal collection', async () => {
    for (const slug of [slugs.private, `missing-${short}`])
      await expect(
        service.updateSetting('home.hero', { collectionSlug: slug }, actor),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    await service.updateSetting('home.hero', { collectionSlug: slugs.seasonal }, actor);
    expect((await settings.getAdminSettings())['home.hero']).toEqual({
      collectionSlug: slugs.seasonal,
    });
    const choices = await settings.getAdminHeroOptions();
    expect(choices.some((option) => option.slug === slugs.seasonal)).toBe(true);
    expect(choices.some((option) => option.slug === slugs.private)).toBe(false);
  });
  it('excludes private/user collections and honors exact Home schedule boundaries on one cached candidate set', async () => {
    const candidates = (await catalog.getHomeCollectionCandidates()).filter((row) =>
      ids.includes(row.id),
    );
    expect(candidates.map((row) => row.id).sort()).toEqual([publicId, seasonalId].sort());
    expect(selectHomeHero(candidates, slugs.seasonal, Date.parse('2040-01-01T00:00:00Z'))?.id).toBe(
      seasonalId,
    );
    expect(selectHomeHero(candidates, slugs.seasonal, Date.parse('2040-01-02T00:00:00Z'))?.id).toBe(
      publicId,
    );
    expect(
      selectHomeCollections(candidates, Date.parse('2040-01-02T00:00:00Z')).map((row) => row.id),
    ).toEqual([publicId]);
  });
  it('returns bounded history/logs and complete defaulted settings without exposing unknown keys', async () => {
    const page = await generator.listAdminGenerationRuns({ aesthetic: `p14-${short}` });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      id: runId,
      seed: 0,
      status: 'failed',
      actorName: 'Operations fixture',
    });
    expect('log' in (page.items[0] ?? {})).toBe(false);
    const detail = await generator.getAdminGenerationRun(runId);
    expect(detail?.log).toHaveLength(100);
    expect(detail?.log.every((line) => line.length <= 2000)).toBe(true);
    await database
      .insert(siteSettings)
      .values({ key: 'features', value: { uploadsEnabled: false } })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: { uploadsEnabled: false } } });
    expect((await settings.getAdminSettings()).features).toEqual(defaultSettings.features);
  });
  it('treats action prefixes literally and includes the entire UTC end day', async () => {
    const page = await audit.listAdminAudit({
      actor: adminId,
      action: 'p14._%',
      entityType: 'fixture',
      entityId: runId,
      from: '2039-12-31',
      to: '2039-12-31',
    });
    expect(page.items.map((row) => row.id)).toEqual([auditId]);
    expect(page.items[0]?.meta).toEqual({ safe: '<script>not HTML</script>' });
    expect(
      (
        await audit.listAdminAudit({
          actor: adminId,
          action: 'p14.%',
          from: '2039-12-31',
          to: '2039-12-31',
        })
      ).items,
    ).toEqual([]);
    expect(
      (await audit.listAdminAudit({ actor: adminId, action: 'p14._%', from: '2040-01-01' })).items,
    ).toEqual([]);
  });
});
