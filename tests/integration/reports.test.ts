import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { Pool } from '@neondatabase/serverless';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { playgroundStateSchema, renderSampleSpec } from '../../content/render-sample';
import { user } from '../../db/schema/auth';
import { reports } from '../../db/schema/moderation';
import { themes } from '../../db/schema/themes';
import type { ReportReporter } from '../../lib/validation/reports';
import type * as ReportService from '../../server/services/reports';

vi.mock('server-only', () => ({}));
const holder = vi.hoisted(() => ({ pooled: undefined as unknown }));
vi.mock('../../db/pool', () => ({
  get dbPool(): unknown {
    if (!holder.pooled) throw new Error('Isolated report database is not ready');
    return holder.pooled;
  },
}));

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const token = randomUUID();
const accountId = `p11-reports-${token}`;
const bannedId = `p11-reports-banned-${token}`;
const spec = renderSampleSpec(playgroundStateSchema.parse({}));
const fixtureIds: string[] = [];

function visitor(label: string): ReportReporter {
  return {
    kind: 'visitor',
    ipHash: createHash('sha256').update(`${token}:${label}`).digest('hex'),
  };
}

describe.skipIf(!TEST_DATABASE_URL)('report service against isolated Neon fixtures', () => {
  let pool: Pool | undefined;
  let database: ReturnType<typeof drizzle>;
  let service: typeof ReportService;

  beforeAll(async () => {
    const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
    pool = new Pool({ connectionString: url, max: 6 });
    database = drizzle({ client: pool });
    holder.pooled = database;
    service = await import('../../server/services/reports');
    await database.insert(user).values([
      {
        id: accountId,
        name: 'Disposable report fixture',
        email: `${accountId}@example.invalid`,
        emailVerified: true,
        banned: false,
      },
      {
        id: bannedId,
        name: 'Disposable banned report fixture',
        email: `${bannedId}@example.invalid`,
        emailVerified: true,
        banned: true,
      },
    ]);
  });

  afterAll(async () => {
    try {
      if (database) {
        if (fixtureIds.length) await database.delete(themes).where(inArray(themes.id, fixtureIds));
        await database.delete(user).where(inArray(user.id, [accountId, bannedId]));
      }
    } finally {
      await pool?.end();
      holder.pooled = undefined;
    }
  });

  async function fixture(status: typeof themes.$inferInsert.status = 'published'): Promise<string> {
    const id = randomUUID();
    fixtureIds.push(id);
    await database
      .insert(themes)
      .values({
        id,
        slug: `p11-report-${id}`,
        status,
        source: 'generated',
        nameEn: 'Disposable report fixture',
        spec,
        specHash: 'a'.repeat(64),
      });
    return id;
  }

  it('creates a visitor report with only its salted hash', async () => {
    const themeId = await fixture();
    const reporter = visitor('one');
    const result = await service.submitReport(
      { themeId, reason: 'broken', details: ' image unavailable ' },
      reporter,
    );
    const [row] = await database.select().from(reports).where(eq(reports.id, result.data.id));
    expect(row).toMatchObject({
      themeId,
      reason: 'broken',
      details: 'image unavailable',
      reporterId: null,
      reporterIpHash: reporter.kind === 'visitor' ? reporter.ipHash : null,
      status: 'open',
    });
    expect(result.tags).toEqual([]);
  });

  it('atomically collapses concurrent open reports across different reasons/details', async () => {
    const themeId = await fixture();
    const reporter = visitor('concurrent');
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        service.submitReport(
          { themeId, reason: index % 2 ? 'spam' : 'other', details: `report ${index}` },
          reporter,
        ),
      ),
    );
    expect(new Set(results.map(({ data }) => data.id)).size).toBe(1);
    const rows = await database.select().from(reports).where(eq(reports.themeId, themeId));
    expect(rows).toHaveLength(1);
    const repeated = await service.submitReport(
      { themeId, reason: 'copyright', details: 'Do not overwrite original details' },
      reporter,
    );
    expect(repeated.data.id).toBe(rows[0]?.id);
    const [unchanged] = await database.select().from(reports).where(eq(reports.themeId, themeId));
    expect(unchanged?.details).toBe(rows[0]?.details);
    expect(unchanged?.reason).toBe(rows[0]?.reason);
  });

  it('keeps distinct reporters separate and does not retain a signed-in IP hash', async () => {
    const themeId = await fixture();
    const [first, second, signedIn] = await Promise.all([
      service.submitReport({ themeId, reason: 'other' }, visitor('first')),
      service.submitReport({ themeId, reason: 'other' }, visitor('second')),
      service.submitReport({ themeId, reason: 'other' }, { kind: 'user', userId: accountId }),
    ]);
    expect(new Set([first.data.id, second.data.id, signedIn.data.id]).size).toBe(3);
    const [row] = await database.select().from(reports).where(eq(reports.id, signedIn.data.id));
    expect(row).toMatchObject({ reporterId: accountId, reporterIpHash: null });
    const repeat = await service.submitReport(
      { themeId, reason: 'broken' },
      { kind: 'user', userId: accountId },
    );
    expect(repeat.data.id).toBe(signedIn.data.id);
  });

  it.each(['resolved', 'dismissed'] as const)(
    'allows a new report after the old report was %s',
    async (status) => {
      const themeId = await fixture();
      const reporter = visitor(status);
      const first = await service.submitReport({ themeId, reason: 'other' }, reporter);
      await database.update(reports).set({ status }).where(eq(reports.id, first.data.id));
      const next = await service.submitReport({ themeId, reason: 'broken' }, reporter);
      expect(next.data.id).not.toBe(first.data.id);
      const open = await database
        .select()
        .from(reports)
        .where(and(eq(reports.themeId, themeId), eq(reports.status, 'open')));
      expect(open).toHaveLength(1);
    },
  );

  it.each(['draft', 'pending_review', 'approved', 'rejected', 'archived'] as const)(
    'does not accept a %s theme',
    async (status) => {
      const themeId = await fixture(status);
      await expect(
        service.submitReport({ themeId, reason: 'other' }, visitor(status)),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(
        await database.select().from(reports).where(eq(reports.themeId, themeId)),
      ).toHaveLength(0);
    },
  );

  it('rechecks banned/deleted accounts in the transaction', async () => {
    const themeId = await fixture();
    await expect(
      service.submitReport({ themeId, reason: 'other' }, { kind: 'user', userId: bannedId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      service.submitReport(
        { themeId, reason: 'other' },
        { kind: 'user', userId: `missing-${token}` },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(await database.select().from(reports).where(eq(reports.themeId, themeId))).toHaveLength(
      0,
    );
  });
});
