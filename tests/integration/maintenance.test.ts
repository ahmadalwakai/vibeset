import { createHash, randomUUID } from 'node:crypto';
import { neon, type Pool } from '@neondatabase/serverless';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { playgroundStateSchema, renderSampleSpec } from '../../content/render-sample';
import { rateLimit, user } from '../../db/schema/auth';
import { favorites, themeStatsDaily } from '../../db/schema/engagement';
import { appRateLimits, uploads } from '../../db/schema/system';
import { themes } from '../../db/schema/themes';
import type { MaintenanceOptions, MaintenanceScope } from '../../lib/maintenance';
import type { ThemeStatus } from '../../lib/theme-status';
import type * as Maintenance from '../../server/services/maintenance';

vi.mock('server-only', () => ({}));
const testUrl = process.env.TEST_DATABASE_URL?.trim();
const token = randomUUID(),
  ownerId = `maintenance-${token}`;
const asOf = '2031-02-03T03:17:00.000Z',
  now = Date.parse(asOf),
  day = 86_400_000;
const spec = renderSampleSpec(playgroundStateSchema.parse({}));
const ownedThemes = new Set<string>(),
  ownedUploads = new Set<string>(),
  ownedAppKeys = new Set<string>(),
  ownedAuthKeys = new Set<string>();
const empty: MaintenanceScope = { themeIds: [], uploadIds: [], appRateKeys: [], authRateKeys: [] };
const options = (scope: Partial<MaintenanceScope>): MaintenanceOptions => ({
  asOf,
  scope: { ...empty, ...scope },
});
function latch(): { promise: Promise<void>; open: () => void } {
  let open: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open: () => open?.() };
}
async function within<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Fixture synchronization timed out')), 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe.skipIf(!testUrl)('daily maintenance on narrowly scoped isolated database fixtures', () => {
  let database: ReturnType<typeof drizzle>, pool: Pool | undefined, service: typeof Maintenance;
  beforeAll(async () => {
    expect(process.env.VERCEL_ENV).not.toBe('production');
    const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(testUrl);
    const host = (value: string): string => new URL(value).hostname.replace(/-pooler(?=\.)/, '');
    for (const ordinary of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED])
      if (ordinary)
        expect(host(url), 'Maintenance tests require a distinct endpoint').not.toBe(host(ordinary));
    // No DB-module mocks: every actual fallback binding is contained to this endpoint.
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
    vi.stubEnv('SKIP_ENV_VALIDATION', undefined);
    database = drizzle({ client: neon(url) });
    const configured = await import('../../db/pool');
    pool = configured.pool;
    service = await import('../../server/services/maintenance');
    await database.insert(user).values({
      id: ownerId,
      name: 'Disposable maintenance fixture',
      email: `${ownerId}@example.invalid`,
    });
  }, 30_000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try {
      if (database) {
        if (ownedAppKeys.size)
          await database.delete(appRateLimits).where(inArray(appRateLimits.key, [...ownedAppKeys]));
        if (ownedAuthKeys.size)
          await database.delete(rateLimit).where(inArray(rateLimit.key, [...ownedAuthKeys]));
        if (ownedThemes.size)
          await database.delete(themes).where(inArray(themes.id, [...ownedThemes]));
        if (ownedUploads.size)
          await database.delete(uploads).where(inArray(uploads.id, [...ownedUploads]));
        await database.delete(user).where(eq(user.id, ownerId));
      }
    } finally {
      try {
        await pool?.end();
      } finally {
        vi.unstubAllEnvs();
      }
    }
  }, 30_000);
  async function theme(
    status: ThemeStatus = 'published',
    patch: Partial<typeof themes.$inferInsert> = {},
  ): Promise<string> {
    const id = randomUUID();
    ownedThemes.add(id);
    await database.insert(themes).values({
      id,
      slug: `maintenance-${id}`,
      source: 'generated',
      status,
      ownerId,
      nameEn: 'Maintenance fixture',
      spec,
      specHash: 'a'.repeat(64),
      popularity: 999,
      favoriteCount: 99,
      downloadCount: 99,
      createdAt: new Date(now - 2 * day),
      publishedAt: new Date(now - 2 * day),
      updatedAt: new Date('2026-01-02T03:04:05.006Z'),
      ...patch,
    });
    return id;
  }
  async function upload(
    createdAt: number,
    status: 'pending' | 'ready' | 'rejected' = 'pending',
  ): Promise<string> {
    const id = randomUUID();
    ownedUploads.add(id);
    await database.insert(uploads).values({
      id,
      ownerId,
      incomingKey: `uploads/incoming/${ownerId}/${id}`,
      contentType: 'image/jpeg',
      status,
      createdAt: new Date(createdAt),
    });
    return id;
  }
  async function current(id: string): Promise<typeof themes.$inferSelect> {
    const [row] = await database.select().from(themes).where(eq(themes.id, id));
    if (!row) throw new Error('Missing maintenance fixture');
    return row;
  }
  function firstCommit(onCommit?: () => void): { promise: Promise<void>; restore: () => void } {
    if (!pool) throw new Error('Missing isolated pool');
    const signal = latch(),
      original = pool.connect.bind(pool);
    let committed = false;
    const spy = vi.spyOn(pool, 'connect').mockImplementation(async () => {
      const client = await original();
      return new Proxy(client, {
        get(target, property, receiver): unknown {
          const value: unknown = Reflect.get(target, property, receiver);
          if (property !== 'query' || typeof value !== 'function') return value;
          return async (...args: unknown[]): Promise<unknown> => {
            const result: unknown = await Reflect.apply(value, target, args);
            if (args[0] === 'COMMIT' && !committed) {
              committed = true;
              onCommit?.();
              signal.open();
            }
            return result;
          };
        },
      });
    });
    return { promise: signal.promise, restore: () => spy.mockRestore() };
  }
  it('uses all weights, UTC day bounds, null/future freshness and preserves updated_at', async () => {
    const weighted = await theme(),
      noStats = await theme('published', { publishedAt: null }),
      future = await theme('published', { publishedAt: new Date(now + day) }),
      draft = await theme('draft'),
      outside = await theme('published');
    await database.insert(themeStatsDaily).values([
      {
        themeId: weighted,
        day: '2031-02-03',
        views: 10,
        downloads: 2,
        iconExports: 1,
        remixes: 1,
        setupCompletions: 1,
      },
      { themeId: weighted, day: '2031-02-02', downloads: 1 },
      { themeId: weighted, day: '2031-01-05', views: 5 },
      { themeId: weighted, day: '2031-01-04', downloads: 1000 },
      { themeId: weighted, day: '2031-02-04', downloads: 1000 },
    ]);
    const before = (await current(weighted)).updatedAt;
    const result = await service.recomputePopularity(
      options({ themeIds: [weighted, noStats, future, draft] }),
    );
    expect(result.data).toEqual({ checked: 3, updated: 3, retried: 0 });
    expect((await current(weighted)).popularity).toBeCloseTo(29.1 + 0.9 ** 29, 9);
    expect((await current(noStats)).popularity).toBeCloseTo(6.4, 9);
    expect((await current(future)).popularity).toBe(10);
    expect((await current(draft)).popularity).toBe(999);
    expect((await current(outside)).popularity).toBe(999);
    expect((await current(weighted)).updatedAt).toEqual(before);
    expect(
      (await service.recomputePopularity(options({ themeIds: [weighted, noStats, future, draft] })))
        .data.updated,
    ).toBe(0);
  });
  it('reconciles all statuses from independent all-time sources and resets empty counters', async () => {
    const published = await theme(),
      draft = await theme('draft'),
      zero = await theme('archived'),
      outside = await theme();
    await database.insert(favorites).values([
      { userId: ownerId, themeId: published },
      { userId: ownerId, themeId: draft },
    ]);
    await database.insert(themeStatsDaily).values([
      { themeId: published, day: '2000-01-01', downloads: 5 },
      { themeId: published, day: '2031-02-03', downloads: 7 },
      { themeId: draft, day: '2000-01-01', downloads: 3 },
    ]);
    const before = (await current(draft)).updatedAt;
    expect(
      (await service.reconcileCounters(options({ themeIds: [published, draft, zero] }))).data,
    ).toEqual({ checked: 3, updated: 3, retried: 0 });
    expect(await current(published)).toMatchObject({ favoriteCount: 1, downloadCount: 12 });
    expect(await current(draft)).toMatchObject({
      favoriteCount: 1,
      downloadCount: 3,
      updatedAt: before,
    });
    expect(await current(zero)).toMatchObject({ favoriteCount: 0, downloadCount: 0 });
    expect(await current(outside)).toMatchObject({ favoriteCount: 99, downloadCount: 99 });
    expect(
      (await service.reconcileCounters(options({ themeIds: [published, draft, zero] }))).data
        .updated,
    ).toBe(0);
  });
  it('retries a skipped theme alone and sees the download committed while its parent lock was held', async () => {
    const blocked = await theme(),
      free = await theme();
    await database
      .insert(themeStatsDaily)
      .values({ themeId: blocked, day: '2031-02-03', downloads: 3 });
    if (!pool) throw new Error('Missing isolated pool');
    const client = await pool.connect(),
      signal = firstCommit();
    let operation: ReturnType<typeof service.reconcileCounters> | undefined;
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM themes WHERE id=$1::uuid FOR UPDATE', [blocked]);
      operation = service.reconcileCounters(options({ themeIds: [blocked, free] }));
      await within(
        Promise.race([
          signal.promise,
          operation.then(() => {
            throw new Error('Expected a skipped row retry');
          }),
        ]),
      );
      // Mirrors tracking: facts and the cached increment commit under the same parent lock.
      await client.query(
        'UPDATE theme_stats_daily SET downloads=downloads+1 WHERE theme_id=$1::uuid',
        [blocked],
      );
      await client.query('UPDATE themes SET download_count=download_count+1 WHERE id=$1::uuid', [
        blocked,
      ]);
      await client.query('COMMIT');
      expect((await operation).data).toEqual({ checked: 2, updated: 2, retried: 1 });
      expect((await current(blocked)).downloadCount).toBe(4);
    } finally {
      signal.restore();
      await client.query('ROLLBACK');
      client.release();
      await operation?.catch(() => undefined);
    }
  }, 20_000);
  it('finishes a skipped popularity row after a concurrent archive without changing its score', async () => {
    const blocked = await theme(),
      free = await theme();
    if (!pool) throw new Error('Missing isolated pool');
    const client = await pool.connect(),
      signal = firstCommit();
    let operation: ReturnType<typeof service.recomputePopularity> | undefined;
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM themes WHERE id=$1::uuid FOR UPDATE', [blocked]);
      operation = service.recomputePopularity(options({ themeIds: [blocked, free] }));
      await within(
        Promise.race([
          signal.promise,
          operation.then(() => {
            throw new Error('Expected a skipped row retry');
          }),
        ]),
      );
      await client.query("UPDATE themes SET status='archived' WHERE id=$1::uuid", [blocked]);
      await client.query('COMMIT');
      expect((await operation).data).toEqual({ checked: 2, updated: 1, retried: 1 });
      expect(await current(blocked)).toMatchObject({ status: 'archived', popularity: 999 });
    } finally {
      signal.restore();
      await client.query('ROLLBACK');
      client.release();
      await operation?.catch(() => undefined);
    }
  }, 20_000);
  it('cleans both limiter tables and expires only old pending uploads with strict thresholds', async () => {
    const appKeys = [0, 1, 2, 3].map((index) => `maintenance:${token}:${index}`),
      authKeys = appKeys.map((key) => createHash('sha256').update(key).digest('hex'));
    appKeys.forEach((key) => ownedAppKeys.add(key));
    authKeys.forEach((key) => ownedAuthKeys.add(key));
    await database.insert(appRateLimits).values(
      appKeys.map((key, index) => ({
        key,
        count: 1,
        windowStart: new Date(
          now - 2 * day + (index === 0 || index === 3 ? -1 : index === 1 ? 0 : 1),
        ),
      })),
    );
    await database.insert(rateLimit).values(
      authKeys.map((key, index) => ({
        id: randomUUID(),
        key,
        count: 1,
        lastRequest: now - 2 * day + (index === 0 || index === 3 ? -1 : index === 1 ? 0 : 1),
      })),
    );
    const expired = await upload(now - day - 1),
      boundary = await upload(now - day),
      fresh = await upload(now - day + 1),
      ready = await upload(now - 2 * day, 'ready'),
      rejected = await upload(now - 2 * day, 'rejected'),
      outside = await upload(now - 2 * day);
    const selected = options({
      appRateKeys: appKeys.slice(0, 3),
      authRateKeys: authKeys.slice(0, 3),
      uploadIds: [expired, boundary, fresh, ready, rejected],
    });
    expect((await service.cleanup(selected)).data).toEqual({
      appRateLimitsDeleted: 1,
      authRateLimitsDeleted: 1,
      uploadsRejected: 1,
    });
    expect(
      (await database.select().from(appRateLimits).where(inArray(appRateLimits.key, appKeys)))
        .map((row) => row.key)
        .sort(),
    ).toEqual(appKeys.slice(1).sort());
    expect(
      (await database.select().from(rateLimit).where(inArray(rateLimit.key, authKeys)))
        .map((row) => row.key)
        .sort(),
    ).toEqual(authKeys.slice(1).sort());
    const rows = await database
      .select()
      .from(uploads)
      .where(inArray(uploads.id, [expired, boundary, fresh, ready, rejected, outside]));
    expect(rows.find((row) => row.id === expired)).toMatchObject({
      status: 'rejected',
      rejectionReason: 'expired',
    });
    for (const id of [boundary, fresh, outside])
      expect(rows.find((row) => row.id === id)?.status).toBe('pending');
    expect(rows.find((row) => row.id === ready)?.status).toBe('ready');
    expect((await service.cleanup(selected)).data).toEqual({
      appRateLimitsDeleted: 0,
      authRateLimitsDeleted: 0,
      uploadsRejected: 0,
    });
  });
  it('waits for an active finalizer only in a one-row retry and preserves its ready upload', async () => {
    const blocked = await upload(now - 2 * day),
      free = await upload(now - 2 * day);
    if (!pool) throw new Error('Missing isolated pool');
    const client = await pool.connect(),
      signal = firstCommit();
    let operation: ReturnType<typeof service.cleanup> | undefined;
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM uploads WHERE id=$1::uuid FOR UPDATE', [blocked]);
      operation = service.cleanup(options({ uploadIds: [blocked, free] }));
      await within(
        Promise.race([
          signal.promise,
          operation.then(() => {
            throw new Error('Expected a skipped upload retry');
          }),
        ]),
      );
      await client.query("UPDATE uploads SET status='ready' WHERE id=$1::uuid", [blocked]);
      await client.query('COMMIT');
      expect((await operation).data.uploadsRejected).toBe(1);
      expect(
        (await database.select().from(uploads).where(eq(uploads.id, blocked)))[0]?.status,
      ).toBe('ready');
    } finally {
      signal.restore();
      await client.query('ROLLBACK');
      client.release();
      await operation?.catch(() => undefined);
    }
  }, 20_000);
  it('exposes confirmed partial counts and pending rows when the shared deadline expires', async () => {
    const blocked = await theme(),
      free = await theme();
    if (!pool) throw new Error('Missing isolated pool');
    const client = await pool.connect(),
      clock = Date.now(),
      signal = firstCommit(() => vi.spyOn(Date, 'now').mockReturnValue(clock + 60_000));
    let operation: ReturnType<typeof service.recomputePopularity> | undefined;
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM themes WHERE id=$1::uuid FOR UPDATE', [blocked]);
      operation = service.recomputePopularity(options({ themeIds: [blocked, free] }));
      await expect(operation).rejects.toMatchObject({
        code: 'INTERNAL',
        phase: 'popularity',
        summary: {
          popularityUpdated: 1,
          popularityPending: 1,
          popularityChecked: 1,
        },
      });
      expect((await current(free)).popularity).not.toBe(999);
    } finally {
      signal.restore();
      vi.restoreAllMocks();
      await client.query('ROLLBACK');
      client.release();
      await operation?.catch(() => undefined);
    }
  }, 20_000);
  it('orchestrates every stage while empty scope dimensions stay empty', async () => {
    const id = await theme();
    const result = await service.runDailyMaintenance(options({ themeIds: [id] }));
    expect(result.tags).toEqual(['themes']);
    expect(result.data).toMatchObject({
      popularityChecked: 1,
      popularityUpdated: 1,
      countersChecked: 1,
      countersUpdated: 1,
      popularityPending: 0,
      countersPending: 0,
      cleanupPending: 0,
      appRateLimitsDeleted: 0,
      authRateLimitsDeleted: 0,
      uploadsRejected: 0,
    });
  });
});
