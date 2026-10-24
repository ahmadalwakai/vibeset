import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apps } from '../../db/schema/catalog';
import { siteSettings, auditLog } from '../../db/schema/system';
import { tags } from '../../db/schema/taxonomy';
import { defaultSettings } from '../../lib/settings';
import type {
  seedApps as appsSeeder,
  seedTaxonomy as taxonomySeeder,
  seedSettings as settingsSeeder,
  SeedResult,
} from '../../server/services/seed-content';

vi.mock('server-only', () => ({}));
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const actor = { kind: 'system', label: 'integration-seed' } as const;

describe.skipIf(!TEST_DATABASE_URL)('atomic, idempotent content seeds', () => {
  let database: ReturnType<typeof drizzle>;
  let seedApps: typeof appsSeeder;
  let seedTaxonomy: typeof taxonomySeeder;
  let seedSettings: typeof settingsSeeder;
  const ownedApps = new Set<string>();
  const ownedTags = new Set<string>();
  const ownedAudit = new Set<string>();
  const ownedSettings = new Set<string>();

  beforeAll(async () => {
    const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
    database = drizzle({ client: neon(url) });
    for (const [key, value] of Object.entries({
      DATABASE_URL: url,
      DATABASE_URL_UNPOOLED: url,
      NODE_ENV: 'test',
      BETTER_AUTH_URL: 'http://localhost:3000',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      BETTER_AUTH_SECRET: 'b'.repeat(32),
      IP_HASH_SALT: 's'.repeat(32),
      CRON_SECRET: 'c'.repeat(32),
      INTERNAL_API_SECRET: 'i'.repeat(32),
    }))
      vi.stubEnv(key, value);
    vi.stubEnv('VERCEL_ENV', undefined);
    vi.stubEnv('SKIP_ENV_VALIDATION', undefined);
    ({ seedApps, seedTaxonomy, seedSettings } = await import('../../server/services/seed-content'));
  });
  afterEach(async () => {
    if (ownedApps.size) await database.delete(apps).where(inArray(apps.slug, [...ownedApps]));
    if (ownedTags.size) await database.delete(tags).where(inArray(tags.slug, [...ownedTags]));
    if (ownedSettings.size)
      await database.delete(siteSettings).where(inArray(siteSettings.key, [...ownedSettings]));
    if (ownedAudit.size)
      await database.delete(auditLog).where(inArray(auditLog.id, [...ownedAudit]));
    ownedApps.clear();
    ownedTags.clear();
    ownedSettings.clear();
    ownedAudit.clear();
  });
  afterAll(() => vi.unstubAllEnvs());

  function own(result: SeedResult): SeedResult {
    if (result.data.auditId) ownedAudit.add(result.data.auditId);
    return result;
  }
  function uniqueSlug(): string {
    return `seed-${randomUUID().replaceAll('-', '').slice(0, 24)}`;
  }

  it('upserts taxonomy metadata while preserving inactivity and no-op timestamps', async () => {
    const slug = uniqueSlug();
    ownedTags.add(slug);
    const row = {
      id: slug,
      slug,
      kind: 'mood',
      nameEn: 'Disposable mood',
      nameAr: 'مزاج تجريبي',
      sortOrder: 2,
    } as const;
    expect(own(await seedTaxonomy({ actor, rows: [row] })).data.changed).toBe(1);
    const old = new Date('2001-01-01T00:00:00Z');
    await database.update(tags).set({ isActive: false, updatedAt: old }).where(eq(tags.slug, slug));
    const unchanged = own(await seedTaxonomy({ actor, rows: [row] }));
    expect(unchanged.data).toEqual({ changed: 0, identifiers: [], auditId: null });
    expect((await database.select().from(tags).where(eq(tags.slug, slug)))[0]).toMatchObject({
      isActive: false,
      updatedAt: old,
    });
    const changed = own(
      await seedTaxonomy({
        actor,
        rows: [{ ...row, nameEn: 'Updated disposable mood', descriptionAr: 'وصف جديد' }],
      }),
    );
    expect(changed.data.identifiers).toEqual([slug]);
    const [stored] = await database.select().from(tags).where(eq(tags.slug, slug));
    expect(stored).toMatchObject({
      nameEn: 'Updated disposable mood',
      descriptionAr: 'وصف جديد',
      isActive: false,
    });
    expect(stored?.updatedAt.getTime()).toBeGreaterThan(old.getTime());
    const logs = await database
      .select()
      .from(auditLog)
      .where(inArray(auditLog.id, [...ownedAudit]));
    expect(logs).toHaveLength(2);
    expect(
      logs.every(({ action, meta }) => action === 'taxonomy.seeded' && meta.changed === 1),
    ).toBe(true);
  }, 30_000);

  it('preserves app activation and verified schemes while conditionally updating curated metadata', async () => {
    const slug = uniqueSlug();
    ownedApps.add(slug);
    const row = {
      slug,
      name: 'Disposable app',
      aliases: ['تطبيق'],
      category: 'system',
      glyph: 'heart',
      rank: 99,
    } as const;
    expect(own(await seedApps({ actor, rows: [row] })).data.changed).toBe(1);
    const old = new Date('2001-01-01T00:00:00Z');
    await database
      .update(apps)
      .set({
        isActive: false,
        iosScheme: 'fixture://',
        androidPackage: 'com.example.fixture',
        updatedAt: old,
      })
      .where(eq(apps.slug, slug));
    expect(own(await seedApps({ actor, rows: [row] })).data.changed).toBe(0);
    expect((await database.select().from(apps).where(eq(apps.slug, slug)))[0]?.updatedAt).toEqual(
      old,
    );
    expect(
      own(await seedApps({ actor, rows: [{ ...row, name: 'Updated disposable app', rank: 100 }] }))
        .data.changed,
    ).toBe(1);
    expect((await database.select().from(apps).where(eq(apps.slug, slug)))[0]).toMatchObject({
      isActive: false,
      iosScheme: 'fixture://',
      androidPackage: 'com.example.fixture',
      rank: 100,
    });
  }, 30_000);

  it('audits only one actual insert for two identical concurrent seed calls', async () => {
    const slug = uniqueSlug();
    ownedTags.add(slug);
    const row = {
      id: slug,
      slug,
      kind: 'mood',
      nameEn: 'Concurrent seed',
      nameAr: 'تجربة متزامنة',
      sortOrder: 0,
    } as const;
    const outcomes = await Promise.all([
      seedTaxonomy({ actor, rows: [row] }),
      seedTaxonomy({ actor, rows: [row] }),
    ]);
    outcomes.forEach(own);
    expect(outcomes.map(({ data }) => data.changed).sort()).toEqual([0, 1]);
    expect(ownedAudit.size).toBe(1);
    expect(await database.select().from(tags).where(eq(tags.slug, slug))).toHaveLength(1);
  }, 30_000);

  it('only inserts missing settings and keeps any administrator value intact', async () => {
    const key = 'home.announcement';
    const [existing] = await database.select().from(siteSettings).where(eq(siteSettings.key, key));
    const inserted = own(await seedSettings({ actor, keys: [key] }));
    expect(inserted.data.changed).toBe(existing ? 0 : 1);
    if (!existing) {
      ownedSettings.add(key);
      expect(
        (await database.select().from(siteSettings).where(eq(siteSettings.key, key)))[0]?.value,
      ).toEqual(defaultSettings[key]);
      await database
        .update(siteSettings)
        .set({
          value: {
            enabled: true,
            textEn: 'Disposable announcement',
            textAr: 'إعلان تجريبي',
            href: '/explore',
            tone: 'info',
          },
        })
        .where(eq(siteSettings.key, key));
    }
    const [before] = await database.select().from(siteSettings).where(eq(siteSettings.key, key));
    const repeated = own(await seedSettings({ actor, keys: [key] }));
    expect(repeated.data).toEqual({ changed: 0, identifiers: [], auditId: null });
    const [after] = await database.select().from(siteSettings).where(eq(siteSettings.key, key));
    expect(after).toEqual(before);
    expect(repeated.tags).toEqual(['settings']);
    if (inserted.data.auditId)
      expect(
        await database
          .select()
          .from(auditLog)
          .where(
            and(eq(auditLog.id, inserted.data.auditId), eq(auditLog.action, 'settings.seeded')),
          ),
      ).toHaveLength(1);
  }, 30_000);
});
