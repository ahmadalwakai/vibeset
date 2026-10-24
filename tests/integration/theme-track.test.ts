import { createHash, randomUUID } from 'node:crypto';
import { neon, type Pool } from '@neondatabase/serverless';
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { playgroundStateSchema, renderSampleSpec } from '../../content/render-sample';
import { themeStatsDaily } from '../../db/schema/engagement';
import { appRateLimits } from '../../db/schema/system';
import { themes } from '../../db/schema/themes';
import { specHash } from '../../lib/render/hash';
import { TRACK_EVENTS } from '../../lib/validation/track';
import type { TrackEvent } from '../../lib/validation/track';
import type { trackThemeEvent as TrackService } from '../../server/services/theme-track';
import type { POST as TrackRoute } from '../../app/api/track/route';

vi.mock('server-only', () => ({}));
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const owned = new Set<string>();
const salt = `integration-track-${randomUUID()}`;
const ip = '203.0.113.42';
const limiterKey = `track:${createHash('sha256').update(ip).update(salt).digest('hex')}`;

describe.skipIf(!TEST_DATABASE_URL)('atomic anonymous aggregate tracking on isolated Neon', () => {
  let database: ReturnType<typeof drizzle>;
  let record: typeof TrackService;
  let post: typeof TrackRoute;
  let pool: Pool | undefined;
  const spec = renderSampleSpec(playgroundStateSchema.parse({ kind: 'mesh', palette: 'lavender' }));
  const updatedAt = new Date('2026-10-01T00:00:00Z');

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
      IP_HASH_SALT: salt,
      CRON_SECRET: 'c'.repeat(32),
      INTERNAL_API_SECRET: 'i'.repeat(32),
    }))
      vi.stubEnv(key, value);
    vi.stubEnv('VERCEL_ENV', undefined);
    vi.stubEnv('SKIP_ENV_VALIDATION', undefined);
    ({ trackThemeEvent: record } = await import('../../server/services/theme-track'));
    ({ POST: post } = await import('../../app/api/track/route'));
  });
  afterAll(async () => {
    try {
      if (database) {
        if (owned.size) await database.delete(themes).where(inArray(themes.id, [...owned]));
        await database.delete(appRateLimits).where(eq(appRateLimits.key, limiterKey));
      }
    } finally {
      try {
        await pool?.end();
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });

  async function fixture(
    status: 'published' | 'draft' | 'archived' = 'published',
  ): Promise<string> {
    const id = randomUUID();
    owned.add(id);
    await database
      .insert(themes)
      .values({
        id,
        slug: `integration-track-${id}`,
        source: 'generated',
        status,
        nameEn: 'Tracking fixture',
        spec,
        specHash: await specHash(spec),
        updatedAt,
      });
    return id;
  }
  function request(id: string, event: TrackEvent): Request {
    return new Request('http://localhost:3000/api/track', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': ip,
        cookie: 'better-auth.session_token=never-read',
      },
      body: JSON.stringify({ themeId: id, event }),
    });
  }

  it('increments every event column atomically and only downloads affect the theme total', async () => {
    const id = await fixture();
    const events = TRACK_EVENTS.flatMap((event, index) =>
      Array.from({ length: index + 1 }, () => event),
    );
    await Promise.all(events.map((event) => record({ themeId: id, event })));
    const [daily] = await database
      .select()
      .from(themeStatsDaily)
      .where(eq(themeStatsDaily.themeId, id));
    const [theme] = await database
      .select({ downloads: themes.downloadCount, updatedAt: themes.updatedAt })
      .from(themes)
      .where(eq(themes.id, id));
    const day = await database.execute(
      sql`SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text AS day`,
    );
    expect(daily).toMatchObject({
      day: day.rows[0]?.day,
      views: 1,
      downloads: 2,
      iconExports: 3,
      remixes: 4,
      setupCompletions: 5,
    });
    expect(theme).toEqual({ downloads: 2, updatedAt });
  });

  it('does not lose increments when concurrent downloads target the same daily row', async () => {
    const id = await fixture();
    const results = await Promise.all(
      Array.from({ length: 24 }, () => record({ themeId: id, event: 'download' })),
    );
    expect(results.every(({ data }) => data.counted)).toBe(true);
    const rows = await database
      .select()
      .from(themeStatsDaily)
      .where(eq(themeStatsDaily.themeId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.downloads).toBe(24);
    const [row] = await database
      .select({ count: themes.downloadCount })
      .from(themes)
      .where(eq(themes.id, id));
    expect(row?.count).toBe(24);
  }, 15_000);

  it('never counts drafts, archived themes, or missing IDs', async () => {
    for (const id of [await fixture('draft'), await fixture('archived'), randomUUID()]) {
      expect((await record({ themeId: id, event: 'download' })).data.counted).toBe(false);
      expect(
        await database.select().from(themeStatsDaily).where(eq(themeStatsDaily.themeId, id)),
      ).toEqual([]);
    }
  });

  it('rechecks publication after waiting for an archival transaction lock', async () => {
    const id = await fixture();
    const configured = await import('../../db/pool');
    pool = configured.pool;
    let pending: ReturnType<typeof record> | undefined;
    let completed = false;
    await configured.dbPool.transaction(async (tx) => {
      await tx.update(themes).set({ status: 'archived' }).where(eq(themes.id, id));
      pending = record({ themeId: id, event: 'download' }).then((value) => {
        completed = true;
        return value;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(completed).toBe(false);
    });
    expect((await pending)?.data.counted).toBe(false);
    expect(
      await database.select().from(themeStatsDaily).where(eq(themeStatsDaily.themeId, id)),
    ).toEqual([]);
    const [theme] = await database
      .select({ count: themes.downloadCount })
      .from(themes)
      .where(eq(themes.id, id));
    expect(theme?.count).toBe(0);
  }, 15_000);

  it('tracks through the real anonymous route and persists only the salted limiter key', async () => {
    const id = await fixture();
    const response = await post(request(id, 'view'));
    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    const [limit] = await database
      .select()
      .from(appRateLimits)
      .where(eq(appRateLimits.key, limiterKey));
    expect(limit?.count).toBe(1);
    expect(limit?.key).toMatch(/^track:[a-f0-9]{64}$/);
    expect(limit?.key).not.toContain(ip);
    const [daily] = await database
      .select()
      .from(themeStatsDaily)
      .where(eq(themeStatsDaily.themeId, id));
    expect(daily?.views).toBe(1);
  });

  it('returns204 at the real rate limit without writing aggregate events', async () => {
    const id = await fixture();
    await database
      .insert(appRateLimits)
      .values({ key: limiterKey, count: 120 })
      .onConflictDoUpdate({
        target: appRateLimits.key,
        set: { count: 120, windowStart: new Date() },
      });
    const response = await post(request(id, 'download'));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(
      await database.select().from(themeStatsDaily).where(eq(themeStatsDaily.themeId, id)),
    ).toEqual([]);
    const [limit] = await database
      .select()
      .from(appRateLimits)
      .where(eq(appRateLimits.key, limiterKey));
    expect(limit?.count).toBe(121);
  });
});
