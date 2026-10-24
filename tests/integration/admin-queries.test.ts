import { createHash, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { playgroundStateSchema, renderSampleSpec } from '../../content/render-sample';
import { user } from '../../db/schema/auth';
import { themeStatsDaily } from '../../db/schema/engagement';
import { creatorProfiles, reports } from '../../db/schema/moderation';
import { auditLog, generationRuns } from '../../db/schema/system';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { themes } from '../../db/schema/themes';
import { decodeAdminReviewCursor } from '../../lib/validation/admin-queries';
import { specHash } from '../../lib/render/hash';
import type { ThemeAssets } from '../../lib/theme-assets';
import type * as Counts from '../../server/admin-queries/counts';
import type * as Dashboard from '../../server/admin-queries/dashboard';
import type * as ThemeQueries from '../../server/admin-queries/themes';
import type * as Review from '../../server/admin-queries/review';
import type * as Publish from '../../server/admin-queries/publish';

const holder = vi.hoisted(() => ({ database: undefined as unknown, guard: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../db', () => ({
  get db(): unknown {
    if (!holder.database) throw new Error('Explicit isolated test DB is not ready');
    return holder.database;
  },
}));
vi.mock('../../server/guards', () => ({ requireAdmin: holder.guard }));
vi.mock('../../lib/env.client', () => ({
  env: { NEXT_PUBLIC_CDN_URL: 'https://cdn.example.invalid' },
}));

const testUrl = process.env.TEST_DATABASE_URL?.trim();
const token = randomUUID().replaceAll('-', '').slice(0, 16);
const owner = `p13-admin-${token}`,
  applicant = `p13-pending-${token}`;
const aesthetic = `p13-${token}`;
const ids: string[] = Array.from({ length: 65 }, () => randomUUID());
const tagIds = [randomUUID(), randomUUID()];
const runId = randomUUID(),
  reportId = randomUUID(),
  auditId = randomUUID();
const spec = renderSampleSpec(playgroundStateSchema.parse({ kind: 'mesh', palette: 'lavender' }));
const hash = 'a'.repeat(64);
const version = (status: string, time: string, hash: string): string =>
  createHash('sha256')
    .update(JSON.stringify([status, time, hash]))
    .digest('hex');

describe.skipIf(!testUrl)('guarded admin reads on disposable isolated database fixtures', () => {
  let database: ReturnType<typeof drizzle>;
  let counts: typeof Counts,
    dashboard: typeof Dashboard,
    tq: typeof ThemeQueries,
    review: typeof Review,
    publish: typeof Publish;
  beforeAll(async () => {
    expect(process.env.VERCEL_ENV).not.toBe('production');
    const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(testUrl);
    const host = (value: string): string => new URL(value).hostname.replace(/-pooler(?=\.)/, '');
    for (const ordinary of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED])
      if (ordinary)
        expect(host(url), 'Live tests require a distinct endpoint').not.toBe(host(ordinary));
    database = drizzle({ client: neon(url) });
    holder.database = database;
    holder.guard.mockResolvedValue({ user: { id: owner, role: 'admin', banned: false } });
    // Preload the exact mocked binding before independent query imports.
    expect((await import('../../db')).db).toBe(database);
    [counts, dashboard, tq, review, publish] = await Promise.all([
      import('../../server/admin-queries/counts'),
      import('../../server/admin-queries/dashboard'),
      import('../../server/admin-queries/themes'),
      import('../../server/admin-queries/review'),
      import('../../server/admin-queries/publish'),
    ]);
    await database.insert(user).values([
      { id: owner, name: 'Admin read fixture', email: `${owner}@example.invalid`, role: 'admin' },
      { id: applicant, name: 'Pending read fixture', email: `${applicant}@example.invalid` },
    ]);
    await database.insert(creatorProfiles).values([
      {
        userId: owner,
        handle: `p13_${token}`,
        displayName: 'Fixture creator',
        status: 'approved',
        isAdult: true,
      },
      {
        userId: applicant,
        handle: `p13p_${token}`,
        displayName: 'Pending fixture',
        status: 'pending',
        isAdult: true,
      },
    ]);
    await database.insert(tags).values([
      {
        id: tagIds[0],
        slug: aesthetic,
        kind: 'aesthetic',
        nameEn: 'Admin fixture',
        nameAr: 'تجريبي',
      },
      {
        id: tagIds[1],
        slug: `p13-inactive-${token}`,
        kind: 'style',
        nameEn: 'Inactive fixture',
        nameAr: 'غير نشط',
        isActive: false,
      },
    ]);
    await database
      .insert(generationRuns)
      .values({ id: runId, aesthetic, seed: 13, requested: 1, actorId: owner });
    const rows: (typeof themes.$inferInsert)[] = ids.map((id, index) => ({
      id,
      slug: `p13-${token}-${index}`,
      nameEn: `P13 fixture ${index}`,
      ownerId: owner,
      source: index < 35 ? 'creator' : 'generated',
      status: index < 35 ? 'pending_review' : 'draft',
      spec,
      specHash: hash,
      generationRunId: runId,
      isFeatured: index === 43,
      colorFamily: index === 43 ? 'purple' : 'blue',
      createdAt: new Date('2020-01-01T00:00:00Z'),
      previewHash:
        index === 0
          ? '0000000000000000'
          : index === 1
            ? '0000000000000001'
            : index === 2
              ? 'ffffffffffffffff'
              : null,
    }));
    Object.assign(rows[40] ?? {}, { source: 'creator' });
    Object.assign(rows[41] ?? {}, { source: 'remix' });
    Object.assign(rows[42] ?? {}, { status: 'approved' });
    Object.assign(rows[43] ?? {}, {
      status: 'published',
      assetVersion: 1,
      assetsSpecHash: 'b'.repeat(64),
      publishedAt: new Date(),
    });
    Object.assign(rows[44] ?? {}, {
      status: 'published',
      assetVersion: 1,
      assetsSpecHash: hash,
      publishedAt: new Date(),
      nameEn: 'Literal 100%_match',
    });
    Object.assign(rows[45] ?? {}, { status: 'archived', assetVersion: 1, assetsSpecHash: hash });
    Object.assign(rows[46] ?? {}, { status: 'approved', publishError: 'Render failed' });
    Object.assign(rows[47] ?? {}, {
      status: 'rejected',
      publishError: 'Earlier error',
      previewHash: '0000000000000000',
    });
    Object.assign(rows[48] ?? {}, { source: 'admin' });
    const id = ids[43];
    expect(id).toBeDefined();
    const prefix = `themes/${id}/v1/${randomUUID()}`;
    const assets: ThemeAssets = {
      version: 1,
      thumb: `${prefix}/thumb.webp`,
      previewHome: `${prefix}/preview-home.webp`,
      previewLock: `${prefix}/preview-lock.webp`,
      og: `${prefix}/og.jpg`,
      wallpapers: {
        phone: { key: `${prefix}/wallpaper-phone.jpg`, w: 1080, h: 2340, bytes: 1234 },
      },
    };
    Object.assign(rows[43] ?? {}, { assets });
    await database.insert(themes).values(rows);
    await database.execute(sql`UPDATE themes SET created_at='2020-01-01 00:00:00+00'::timestamptz +
      CASE id ${sql.join(
        ids.map((id, index) => sql`WHEN ${id}::uuid THEN ${index + 1}::int`),
        sql` `,
      )} END * interval '1 microsecond'
      WHERE id IN (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`);
    await database
      .update(themes)
      .set({ submittedAt: sql`'2020-01-02 00:00:00.123456+00'::timestamptz` })
      .where(inArray(themes.id, ids.slice(0, 35)));
    await database
      .insert(themeTags)
      .values(ids.map((themeId) => ({ themeId, tagId: tagIds[0] as string })));
    await database
      .insert(themeTags)
      .values({ themeId: ids[43] as string, tagId: tagIds[1] as string });
    await database
      .insert(reports)
      .values({ id: reportId, themeId: ids[43] as string, reporterId: applicant, reason: 'other' });
    await database.insert(auditLog).values({
      id: auditId,
      actorId: owner,
      entityType: 'theme',
      entityId: ids[43],
      action: 'theme.updated',
      meta: { fixture: true },
    });
    await database.insert(themeStatsDaily).values([
      {
        themeId: ids[43] as string,
        day: sql`(now() AT TIME ZONE 'UTC')::date`,
        downloads: 100000,
        views: 3,
      },
      { themeId: ids[43] as string, day: sql`(now() AT TIME ZONE 'UTC')::date-1`, downloads: 7 },
      { themeId: ids[43] as string, day: sql`(now() AT TIME ZONE 'UTC')::date-29`, downloads: 5 },
      {
        themeId: ids[43] as string,
        day: sql`(now() AT TIME ZONE 'UTC')::date-30`,
        downloads: 999999,
      },
      {
        themeId: ids[43] as string,
        day: sql`(now() AT TIME ZONE 'UTC')::date+1`,
        downloads: 999999,
      },
    ]);
  }, 30_000);
  afterAll(async () => {
    if (database) {
      await database.delete(auditLog).where(eq(auditLog.id, auditId));
      await database.delete(themes).where(inArray(themes.id, ids));
      await database.delete(generationRuns).where(eq(generationRuns.id, runId));
      await database.delete(tags).where(inArray(tags.id, tagIds));
      await database.delete(user).where(inArray(user.id, [owner, applicant]));
    }
  });
  it('paginates50 and combines all URL filters; literal wildcard text stays literal', async () => {
    const first = await tq.listAdminThemes({ aesthetic });
    expect(first.items).toHaveLength(50);
    expect(first.total).toBe(65);
    expect(first.nextPage).toBe(2);
    const second = await tq.listAdminThemes({ aesthetic, page: '2' });
    expect(second.items).toHaveLength(15);
    expect(second.nextPage).toBeNull();
    expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(65);
    const filtered = await tq.listAdminThemes({
      aesthetic,
      run: runId,
      color: 'purple',
      stale: 'true',
      featured: '1',
      status: 'published',
      source: 'generated',
    });
    expect(filtered.items.map((row) => row.id)).toEqual([ids[43]]);
    expect(
      (await tq.listAdminThemes({ aesthetic, q: '%_match' })).items.map((row) => row.id),
    ).toEqual([ids[44]]);
    expect(
      (await tq.listAdminThemes({ aesthetic, stale: false, status: 'approved' })).items.some(
        (row) => row.id === ids[42],
      ),
    ).toBe(true);
  });
  it('returns any-status editor metadata, inactive tags, precise history and zero-filled UTC stats', async () => {
    const editor = await tq.getAdminTheme(ids[43] as string);
    expect(editor).toMatchObject({
      stale: true,
      isFeatured: true,
      owner: { id: owner, creatorStatus: 'approved' },
    });
    expect(editor?.tags.some((tag) => !tag.isActive)).toBe(true);
    expect(
      editor?.history.some((row) => row.id === auditId && row.actorName === 'Admin read fixture'),
    ).toBe(true);
    expect(editor?.stats).toHaveLength(30);
    expect(editor?.stats.reduce((sum, row) => sum + row.downloads, 0)).toBe(100012);
    expect(editor?.wallpapers[0]).toMatchObject({ w: 1080, h: 2340, bytes: 1234 });
    expect((await tq.getAdminTheme(ids[47] as string))?.status).toBe('rejected');
    expect(await tq.getAdminTheme(randomUUID())).toBeNull();
  });
  it('keeps stable review pagination when earlier decisions disappear, including microsecond ties', async () => {
    const first = await review.listAdminReview({ aesthetic });
    expect(first.items.map((row) => row.id)).toEqual(ids.slice(0, 30));
    expect(first.nextCursor).not.toBeNull();
    const cursor = decodeAdminReviewCursor(first.nextCursor as string);
    expect(cursor.at).toBe('2020-01-01T00:00:00.000030Z');
    expect(first.items[0]?.qa.minIconContrast).toBeGreaterThan(0);
    expect(first.items[0]?.nearestDuplicate?.distance).toBeLessThanOrEqual(1);
    expect(first.items[0]?.nearestDuplicate?.id).not.toBe(ids[47]);
    await database
      .update(themes)
      .set({ status: 'approved' })
      .where(inArray(themes.id, ids.slice(0, 30)));
    const next = await review.listAdminReview({ aesthetic, page: 2, cursor: first.nextCursor });
    expect(next.items.slice(0, 5).map((row) => row.id)).toEqual(ids.slice(30, 35));
    expect(next.items.some((row) => [ids[40], ids[41], ids[48]].includes(row.id))).toBe(false);
    expect(next.items).toHaveLength(26);
    expect(next.nextCursor).toBeNull();
  });
  it('identifies resubmissions by raw submission microseconds and spec hash, independently of featured changes', async () => {
    const id = ids[30] as string;
    const read = async (): Promise<string | undefined> =>
      (await review.listAdminReview({ aesthetic })).items.find((item) => item.id === id)
        ?.reviewVersion;
    const original = await read();
    expect(original).toBe(version('pending_review', '2020-01-02T00:00:00.123456Z', hash));
    await database.update(themes).set({ isFeatured: true }).where(eq(themes.id, id));
    expect(await read()).toBe(original);
    await database
      .update(themes)
      .set({ submittedAt: sql`'2020-01-02 00:00:00.123457+00'::timestamptz` })
      .where(eq(themes.id, id));
    const resubmitted = await read();
    expect(resubmitted).toBe(version('pending_review', '2020-01-02T00:00:00.123457Z', hash));
    const revised = { ...spec, palette: { ...spec.palette, bg: '#445566' } };
    const nextHash = await specHash(revised);
    await database
      .update(themes)
      .set({ spec: revised, specHash: nextHash })
      .where(eq(themes.id, id));
    expect(await read()).toBe(version('pending_review', '2020-01-02T00:00:00.123457Z', nextHash));
    const generatedId = ids[35] as string;
    const generated = async (): Promise<string | undefined> =>
      (await review.listAdminReview({ aesthetic })).items.find((item) => item.id === generatedId)
        ?.reviewVersion;
    const previous = await generated();
    expect(previous).toBeDefined();
    await database
      .update(themes)
      .set({ nameEn: 'Revised generated draft' })
      .where(eq(themes.id, generatedId));
    expect(await generated()).not.toBe(previous);
  });
  it('refreshes an exact eligible review item with the complete revised spec and token', async () => {
    const id = ids[36] as string;
    const previous = await review.getAdminReviewItem(id);
    expect(previous?.status).toBe('draft');
    expect(previous?.reviewVersion).toMatch(/^[a-f0-9]{64}$/);
    const revised = { ...spec, palette: { ...spec.palette, primary: '#123456' } };
    await database
      .update(themes)
      .set({ spec: revised, specHash: await specHash(revised), isFeatured: true })
      .where(eq(themes.id, id));
    const refreshed = await review.getAdminReviewItem(id);
    expect(refreshed?.spec).toEqual(revised);
    expect(refreshed?.isFeatured).toBe(true);
    expect(refreshed?.reviewVersion).not.toBe(previous?.reviewVersion);
    expect(refreshed?.qa).toBeDefined();
    await database.update(themes).set({ status: 'approved' }).where(eq(themes.id, id));
    expect(await review.getAdminReviewItem(id)).toBeNull();
    expect(await review.getAdminReviewItem(ids[40] as string)).toBeNull();
    expect(await review.getAdminReviewItem(randomUUID())).toBeNull();
  });
  it('lists each publish candidate category without treating untouched drafts as stale', async () => {
    for (const [kind, target] of [
      ['approved', 42],
      ['stale', 43],
      ['archived', 45],
      ['failed', 46],
    ] as const) {
      expect(
        (await publish.listAdminPublish({ kind })).items.some((row) => row.id === ids[target]),
      ).toBe(true);
    }
    const rows = (await publish.listAdminPublish({ kind: 'stale' })).items;
    expect(rows.some((row) => row.id === ids[44] || row.id === ids[40])).toBe(false);
  });
  it('loads dashboard aggregates/options without private account credentials', async () => {
    const kpis = await dashboard.getAdminDashboardKpis();
    expect(kpis.downloadsToday).toBeGreaterThanOrEqual(100000);
    expect(kpis.downloads7d).toBeGreaterThanOrEqual(100007);
    expect(kpis.downloads30d).toBeGreaterThanOrEqual(100012);
    const badges = await counts.getAdminCounts();
    expect(badges.pendingReview).toBeGreaterThanOrEqual(5);
    expect(badges.pendingCreators).toBeGreaterThanOrEqual(1);
    expect(badges.openReports).toBeGreaterThanOrEqual(1);
    expect(await dashboard.getAdminDownloads()).toHaveLength(30);
    expect((await dashboard.getAdminTopThemes()).find((row) => row.id === ids[43])?.downloads).toBe(
      100007,
    );
    const recent = await dashboard.getAdminRecentAudit();
    expect(recent.length).toBeLessThanOrEqual(20);
    expect(recent.every((row) => Number.isFinite(Date.parse(row.createdAt)))).toBe(true);
    const options = await tq.getAdminThemeOptions();
    expect(options.tags.some((tag) => tag.id === tagIds[1] && !tag.isActive)).toBe(true);
    expect(options.runs.some((run) => run.id === runId)).toBe(true);
    expect(JSON.stringify(options)).not.toContain('@example.invalid');
  });
});
