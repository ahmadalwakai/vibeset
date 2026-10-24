import { randomUUID } from 'node:crypto';
import { neon, Pool } from '@neondatabase/serverless';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { renderSampleSpec, playgroundStateSchema } from '../../content/render-sample';
import { session, user } from '../../db/schema/auth';
import { creatorProfiles, reports } from '../../db/schema/moderation';
import { auditLog } from '../../db/schema/system';
import { themes } from '../../db/schema/themes';
import { specHash } from '../../lib/render/hash';
import type { Actor } from '../../lib/theme-status';
import type * as PoolModule from '../../db/pool';
import type * as Users from '../../server/services/users';
import type * as Creators from '../../server/services/creators';
import type * as Reports from '../../server/services/admin-reports';
import type * as Audit from '../../server/audit';
import type * as UserReads from '../../server/admin-queries/users';
import type * as CreatorReads from '../../server/admin-queries/creators';
import type * as ReportReads from '../../server/admin-queries/reports';

vi.mock('server-only', () => ({}));
const holder = vi.hoisted(() => ({
  database: undefined as unknown,
  pooled: undefined as unknown,
  guard: vi.fn(),
}));
vi.mock('../../db', () => ({
  get db(): unknown {
    if (!holder.database) throw new Error('Isolated fixture not ready');
    return holder.database;
  },
}));
vi.mock('../../db/pool', () => ({
  get dbPool(): unknown {
    if (!holder.pooled) throw new Error('Isolated fixture not ready');
    return holder.pooled;
  },
}));
vi.mock('../../server/guards', () => ({ requireAdmin: holder.guard }));
vi.mock('../../lib/env.client', () => ({
  env: {
    NEXT_PUBLIC_SITE_URL: 'https://example.invalid',
    NEXT_PUBLIC_CDN_URL: 'https://cdn.example.invalid',
  },
}));

const testUrl = process.env.TEST_DATABASE_URL?.trim(),
  token = randomUUID(),
  short = token.slice(0, 8);
const people = ['admin', 'admin2', 'banned-admin', 'owner', 'reporter', 'applicant', 'other'].map(
  (name) => `p14-${name}-${token}`,
);
const [
  adminId = '',
  admin2Id = '',
  bannedId = '',
  ownerId = '',
  reporterId = '',
  applicantId = '',
  otherId = '',
] = people;
const actor = (id = adminId): Actor => ({
  kind: 'user',
  userId: id,
  role: 'admin',
  isCreator: false,
});
const themeIds = new Set<string>(),
  reportIds = new Set<string>();
const spec = renderSampleSpec(playgroundStateSchema.parse({}));

describe.skipIf(!testUrl)('atomic admin moderation on isolated disposable fixtures', () => {
  let database: ReturnType<typeof drizzle>,
    pool: Pool | undefined,
    fallbackPool: Pool | undefined,
    users: typeof Users,
    creators: typeof Creators,
    reportService: typeof Reports;
  let audit: typeof Audit,
    userReads: typeof UserReads,
    creatorReads: typeof CreatorReads,
    reportReads: typeof ReportReads;
  beforeAll(async () => {
    expect(process.env.VERCEL_ENV).not.toBe('production');
    const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(testUrl);
    const host = (value: string): string => new URL(value).hostname.replace(/-pooler(?=\.)/, '');
    for (const ordinary of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED])
      if (ordinary)
        expect(host(url), 'Tests require a distinct database endpoint').not.toBe(host(ordinary));
    // Dynamic-import graph fallbacks must be isolated even if Vitest bypasses a DB mock.
    vi.stubEnv('DATABASE_URL', url);
    vi.stubEnv('DATABASE_URL_UNPOOLED', url);
    database = drizzle({ client: neon(url) });
    pool = new Pool({ connectionString: url, max: 6, application_name: `p14-moderation-${short}` });
    holder.database = database;
    holder.pooled = drizzlePool({ client: pool });
    // Capture the actual module's singleton too, so an import fallback cannot leave it open.
    fallbackPool = (await vi.importActual<typeof PoolModule>('../../db/pool')).pool;
    expect((await import('../../db')).db).toBe(database);
    expect((await import('../../db/pool')).dbPool).toBe(holder.pooled);
    [users, creators, reportService, audit, userReads, creatorReads, reportReads] =
      await Promise.all([
        import('../../server/services/users'),
        import('../../server/services/creators'),
        import('../../server/services/admin-reports'),
        import('../../server/audit'),
        import('../../server/admin-queries/users'),
        import('../../server/admin-queries/creators'),
        import('../../server/admin-queries/reports'),
      ]);
    await database.insert(user).values(
      people.map((id) => ({
        id,
        name: `Disposable ${id}`,
        email: `${id}@example.invalid`,
        role: [adminId, admin2Id, bannedId].includes(id) ? 'admin' : 'user',
        banned: id === bannedId,
      })),
    );
    await database.insert(creatorProfiles).values([
      {
        userId: ownerId,
        handle: `p14_${short}`,
        displayName: 'Fixture creator',
        status: 'approved',
        isAdult: true,
      },
      {
        userId: applicantId,
        handle: `p14a_${short}`,
        displayName: 'Fixture applicant',
        status: 'pending',
        isAdult: true,
        bio: 'Original nature photography',
        links: [{ label: 'Portfolio', url: 'https://example.invalid' }],
      },
    ]);
  }, 30_000);
  beforeEach(async () => {
    holder.guard.mockResolvedValue({ user: { id: adminId, role: 'admin', banned: false } });
    await database
      .update(user)
      .set({ role: 'admin', banned: false, banReason: null, banExpires: null })
      .where(inArray(user.id, [adminId, admin2Id]));
    await database
      .update(user)
      .set({ role: 'user', banned: false, banReason: null, banExpires: null })
      .where(inArray(user.id, [ownerId, reporterId, applicantId, otherId]));
    await database
      .update(creatorProfiles)
      .set({ status: 'approved' })
      .where(eq(creatorProfiles.userId, ownerId));
    await database
      .update(creatorProfiles)
      .set({ status: 'pending' })
      .where(eq(creatorProfiles.userId, applicantId));
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try {
      if (database) {
        const ids = [...people, ...themeIds, ...reportIds];
        await database.delete(auditLog).where(inArray(auditLog.entityId, ids));
        if (themeIds.size) await database.delete(themes).where(inArray(themes.id, [...themeIds]));
        await database.delete(user).where(inArray(user.id, people));
      }
    } finally {
      try {
        await pool?.end();
      } finally {
        try {
          await fallbackPool?.end();
        } finally {
          vi.unstubAllEnvs();
        }
      }
    }
  }, 30_000);
  async function theme(
    status: 'published' | 'draft' | 'archived' = 'published',
    owner: string | null = ownerId,
  ): Promise<string> {
    const id = randomUUID();
    themeIds.add(id);
    await database.insert(themes).values({
      id,
      slug: `p14-${id}`,
      nameEn: 'Moderation fixture',
      source: 'creator',
      ownerId: owner,
      status,
      spec,
      specHash: await specHash(spec),
      assetVersion: status === 'draft' ? 0 : 1,
    });
    return id;
  }
  async function report(themeId: string): Promise<string> {
    const id = randomUUID();
    reportIds.add(id);
    await database.insert(reports).values({
      id,
      themeId,
      reporterId,
      reporterIpHash: 'f'.repeat(64),
      reason: 'copyright',
      details: 'Original file belongs to someone else.',
    });
    return id;
  }
  async function sessions(id: string): Promise<void> {
    await database.insert(session).values({
      id: randomUUID(),
      token: randomUUID(),
      userId: id,
      expiresAt: new Date(Date.now() + 3_600_000),
      updatedAt: new Date(),
    });
  }
  async function current(id: string) {
    return (await database.select().from(user).where(eq(user.id, id)))[0];
  }
  async function entries(id: string) {
    return database.select().from(auditLog).where(eq(auditLog.entityId, id));
  }

  it('rejects self moderation and stale/forged admin actors before any mutation', async () => {
    for (const call of [
      () => users.adminSetRole({ userId: adminId, role: 'user' }, actor()),
      () => users.adminBanUser({ userId: adminId, reason: 'Cannot ban self' }, actor()),
      () => users.adminUnbanUser({ userId: adminId }, actor()),
      () => users.adminSetRole({ userId: otherId, role: 'admin' }, actor(ownerId)),
    ])
      await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await entries(adminId)).toHaveLength(0);
    await database.update(user).set({ banned: true }).where(eq(user.id, admin2Id));
    await expect(
      users.adminBanUser({ userId: otherId, reason: 'Stale admin' }, actor(admin2Id)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('serializes cross-admin demotions and revokes the affected sessions', async () => {
    await sessions(adminId);
    await sessions(admin2Id);
    const results = await Promise.allSettled([
      users.adminSetRole({ userId: admin2Id, role: 'user' }, actor()),
      users.adminSetRole({ userId: adminId, role: 'user' }, actor(admin2Id)),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rows = await database
      .select()
      .from(user)
      .where(inArray(user.id, [adminId, admin2Id]));
    const demoted = rows.find((row) => row.role === 'user'),
      remaining = rows.find((row) => row.role === 'admin');
    expect(demoted).toBeDefined();
    expect(remaining).toBeDefined();
    if (!demoted || !remaining) throw new Error('Expected exactly one demotion');
    expect(
      await database.select().from(session).where(eq(session.userId, demoted.id)),
    ).toHaveLength(0);
    expect(
      (await entries(demoted.id)).filter((entry) => entry.action === 'user.role.set'),
    ).toHaveLength(1);
  });
  it('protects the last unbanned admin through the system CLI, even with another banned admin', async (context) => {
    const outsiders = await database
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.role, 'admin'), eq(user.banned, false)));
    if (outsiders.some((row) => !people.includes(row.id))) {
      context.skip('Last-admin assertion requires no external test admins');
      return;
    }
    await database.update(user).set({ banned: true }).where(eq(user.id, admin2Id));
    const active = await current(adminId);
    if (!active) throw new Error('Missing disposable admin');
    await expect(users.setRoleByEmail(active.email, 'user', 'system')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect((await current(adminId))?.role).toBe('admin');
  });
  it('serializes cross-admin bans without allowing a banned actor to continue', async () => {
    const results = await Promise.allSettled([
      users.adminBanUser({ userId: admin2Id, reason: 'First decision' }, actor()),
      users.adminBanUser({ userId: adminId, reason: 'Second decision' }, actor(admin2Id)),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected')
      expect(failure.reason as unknown).toMatchObject({ code: 'FORBIDDEN' });
    const admins = await database
      .select()
      .from(user)
      .where(inArray(user.id, [adminId, admin2Id]));
    expect(admins.filter((row) => !row.banned)).toHaveLength(1);
  });
  it('bans immediately, revokes all sessions, and archives only when explicitly requested', async () => {
    const published = await theme(),
      draft = await theme('draft');
    await sessions(ownerId);
    await sessions(ownerId);
    const before = (await entries(ownerId)).length;
    expect(
      (await users.adminBanUser({ userId: ownerId, reason: 'Repeated infringement' }, actor())).data
        .archived,
    ).toBe(0);
    expect((await current(ownerId))?.banned).toBe(true);
    expect(await database.select().from(session).where(eq(session.userId, ownerId))).toHaveLength(
      0,
    );
    expect((await database.select().from(themes).where(eq(themes.id, published)))[0]?.status).toBe(
      'published',
    );
    const result = await users.adminBanUser(
      { userId: ownerId, reason: 'Repeated infringement', archiveThemes: true },
      actor(),
    );
    expect(result.data.archived).toBe(1);
    expect(result.tags).toContain(`theme:p14-${published}`);
    expect((await database.select().from(themes).where(eq(themes.id, draft)))[0]?.status).toBe(
      'draft',
    );
    expect((await entries(ownerId)).length).toBe(before + 1);
    await users.adminUnbanUser({ userId: ownerId }, actor());
    expect(await current(ownerId)).toMatchObject({
      banned: false,
      banReason: null,
      banExpires: null,
    });
  });
  it('rolls back role and session changes when its atomic audit fails', async () => {
    await sessions(otherId);
    const spy = vi.spyOn(audit, 'auditInsert').mockImplementation(() => {
      throw new Error('Intentional audit failure');
    });
    await expect(users.adminSetRole({ userId: otherId, role: 'admin' }, actor())).rejects.toThrow(
      'Intentional audit failure',
    );
    spy.mockRestore();
    expect((await current(otherId))?.role).toBe('user');
    expect(
      await database.select().from(session).where(eq(session.userId, otherId)),
    ).not.toHaveLength(0);
  });
  it('resolves one report exactly once under concurrency using the theme state machine', async () => {
    const id = await theme(),
      reportId = await report(id);
    const results = await Promise.allSettled([
      reportService.resolveReport(
        { id: reportId, action: 'archive_theme', note: 'Verified original source' },
        actor(),
      ),
      reportService.resolveReport(
        { id: reportId, action: 'dismiss', note: 'Concurrent second decision' },
        actor(),
      ),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected')
      expect(failed.reason as unknown).toMatchObject({ code: 'INVALID_STATE' });
    expect(
      (await entries(reportId)).filter((entry) => entry.action.startsWith('report.')),
    ).toHaveLength(1);
    const row = (await database.select().from(reports).where(eq(reports.id, reportId)))[0];
    if (row?.status === 'resolved')
      expect((await database.select().from(themes).where(eq(themes.id, id)))[0]?.status).toBe(
        'archived',
      );
  });
  it('can resolve an already archived target without duplicating archive audits', async () => {
    const id = await theme('archived'),
      reportId = await report(id);
    expect(
      (
        await reportService.resolveReport(
          { id: reportId, action: 'archive_theme', note: 'Already removed from public view' },
          actor(),
        )
      ).data.archived,
    ).toBe(0);
    expect(await entries(id)).toHaveLength(0);
    expect((await entries(reportId)).map((entry) => entry.action)).toEqual(['report.resolved']);
  });
  it('keeps ban, all-owned archival, report resolution and audits atomic on failure', async () => {
    const id = await theme(),
      extra = await theme(),
      reportId = await report(id);
    await sessions(ownerId);
    const original = audit.auditInsert;
    const spy = vi.spyOn(audit, 'auditInsert').mockImplementation((entry) => {
      if (entry.entityType === 'report') throw new Error('Intentional report audit failure');
      return original(entry);
    });
    await expect(
      reportService.resolveReport(
        {
          id: reportId,
          action: 'ban_owner',
          note: 'Verified repeated infringement',
          archiveThemes: true,
        },
        actor(),
      ),
    ).rejects.toThrow('Intentional report audit failure');
    spy.mockRestore();
    expect((await current(ownerId))?.banned).toBe(false);
    expect((await database.select().from(reports).where(eq(reports.id, reportId)))[0]?.status).toBe(
      'open',
    );
    expect(
      (
        await database
          .select()
          .from(themes)
          .where(inArray(themes.id, [id, extra]))
      ).every((row) => row.status === 'published'),
    ).toBe(true);
    expect(await entries(reportId)).toHaveLength(0);
    const result = await reportService.resolveReport(
      {
        id: reportId,
        action: 'ban_owner',
        note: 'Verified repeated infringement',
        archiveThemes: true,
      },
      actor(),
    );
    expect(result.data.archived).toBeGreaterThanOrEqual(2);
    expect((await current(ownerId))?.banned).toBe(true);
  });
  it('defaults ban-owner to retaining public themes and safely handles orphan owners', async () => {
    const id = await theme('published', otherId),
      reportId = await report(id);
    expect(
      (
        await reportService.resolveReport(
          { id: reportId, action: 'ban_owner', note: 'Confirmed spam' },
          actor(),
        )
      ).data.archived,
    ).toBe(0);
    expect((await database.select().from(themes).where(eq(themes.id, id)))[0]?.status).toBe(
      'published',
    );
    const orphanReport = await report(await theme('published', null));
    await expect(
      reportService.resolveReport(
        { id: orphanReport, action: 'ban_owner', note: 'No owner account' },
        actor(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(
      (await database.select().from(reports).where(eq(reports.id, orphanReport)))[0]?.status,
    ).toBe('open');
  });
  it('reviews creators through their existing transitions and optionally archives on suspension', async () => {
    expect(
      (await creators.reviewCreator({ userId: applicantId, decision: 'approve' }, actor())).data,
    ).toEqual({ status: 'approved', archived: 0 });
    const id = await theme('published', applicantId);
    expect(
      (
        await creators.reviewCreator(
          { userId: applicantId, decision: 'suspend', reason: 'Repeated infringement' },
          actor(),
        )
      ).data.archived,
    ).toBe(0);
    expect((await database.select().from(themes).where(eq(themes.id, id)))[0]?.status).toBe(
      'published',
    );
    await creators.reviewCreator({ userId: applicantId, decision: 'approve' }, actor());
    expect(
      (
        await creators.reviewCreator(
          {
            userId: applicantId,
            decision: 'suspend',
            reason: 'Repeated infringement',
            archiveThemes: true,
          },
          actor(),
        )
      ).data.archived,
    ).toBe(1);
    await expect(
      creators.reviewCreator(
        { userId: applicantId, decision: 'reject', reason: 'Invalid transition' },
        actor(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
  it('returns guarded bounded reads with reporter email masking and no raw IP/account secrets', async () => {
    const id = await theme(),
      reportId = await report(id);
    const reportDetail = await reportReads.getAdminReport(reportId);
    expect(reportDetail?.reporter?.maskedEmail).toBe('p***@example.invalid');
    expect(JSON.stringify(reportDetail)).not.toContain(`${reporterId}@example.invalid`);
    expect(JSON.stringify(reportDetail)).not.toContain('f'.repeat(64));
    expect(JSON.stringify(reportDetail)).not.toContain('reporterIpHash');
    expect((await userReads.getAdminUser(ownerId))?.counts.themes).toBeGreaterThan(0);
    expect((await creatorReads.getAdminCreator(applicantId))?.links).toHaveLength(1);
    expect((await userReads.listAdminUsers({ q: token })).total).toBe(people.length);
    expect((await userReads.listAdminUsers({ q: `${token}%` })).total).toBe(0);
    expect(
      (await userReads.listAdminUsers({ q: token, role: 'admin', banned: false })).items
        .map((row) => row.id)
        .sort(),
    ).toEqual([adminId, admin2Id].sort());
    expect(
      (await userReads.listAdminUsers({ q: token, creatorStatus: 'pending' })).items.map(
        (row) => row.id,
      ),
    ).toEqual([applicantId]);
    for (const page of [
      await userReads.listAdminUsers({ q: token }),
      await creatorReads.listAdminCreators({ q: short, status: 'all' }),
      await reportReads.listAdminReports({ status: 'open' }),
    ])
      expect(page.items.length).toBeLessThanOrEqual(50);
    holder.guard.mockRejectedValue(Object.assign(new Error('denied'), { code: 'FORBIDDEN' }));
    await expect(userReads.getAdminUser(ownerId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
