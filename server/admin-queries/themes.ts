import 'server-only';

import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { user } from '../../db/schema/auth';
import { collections } from '../../db/schema/collections';
import { auditLog, generationRuns } from '../../db/schema/system';
import { tags } from '../../db/schema/taxonomy';
import { themes } from '../../db/schema/themes';
import type {
  AdminPage,
  AdminThemeEditorDTO,
  AdminThemeOptions,
  AdminThemeRow,
} from '../../lib/admin';
import { themeSpecSchema } from '../../lib/render/spec';
import { themeIdSchema } from '../../lib/theme-status';
import { adminQueryInput, adminThemeListSchema } from '../../lib/validation/admin-queries';
import type { AdminThemeListQuery } from '../../lib/validation/admin-queries';
import { requireAdmin } from '../guards';
import { cdnUrl } from '../storage/urls';
import {
  auditColumns,
  auditDto,
  hydrateThemes,
  offsetPage,
  staleSql,
  statsSql,
  themeColumns,
} from './admin-shared';

function conditions(value: AdminThemeListQuery): SQL | undefined {
  const text = value.q ? `%${value.q.replace(/[\\%_]/g, '\\$&')}%` : undefined;
  return and(
    value.status ? eq(themes.status, value.status) : undefined,
    value.source ? eq(themes.source, value.source) : undefined,
    value.color ? eq(themes.colorFamily, value.color) : undefined,
    value.featured === undefined ? undefined : eq(themes.isFeatured, value.featured),
    value.stale === undefined ? undefined : value.stale ? staleSql : sql`NOT (${staleSql})`,
    value.run ? eq(themes.generationRunId, value.run) : undefined,
    value.aesthetic
      ? sql`EXISTS(SELECT 1 FROM theme_tags tt JOIN tags t ON t.id=tt.tag_id
      WHERE tt.theme_id=${themes.id} AND t.kind='aesthetic' AND t.slug=${value.aesthetic})`
      : undefined,
    text
      ? or(ilike(themes.nameEn, text), ilike(themes.nameAr, text), ilike(themes.slug, text))
      : undefined,
  );
}

export async function listAdminThemes(input: unknown = {}): Promise<AdminPage<AdminThemeRow>> {
  await requireAdmin();
  const value = adminThemeListSchema.parse(adminQueryInput(input));
  const { db } = await import('../../db');
  const where = conditions(value);
  const order =
    value.sort === 'published'
      ? sql`${themes.publishedAt} DESC NULLS LAST`
      : value.sort === 'popularity'
        ? desc(themes.popularity)
        : value.sort === 'downloads'
          ? desc(themes.downloadCount)
          : desc(themes.updatedAt);
  const [rows, totals] = await Promise.all([
    db
      .select(themeColumns)
      .from(themes)
      .where(where)
      .orderBy(order, desc(themes.id))
      .limit(50)
      .offset((value.page - 1) * 50),
    db.select({ total: count() }).from(themes).where(where),
  ]);
  return offsetPage(await hydrateThemes(rows), totals[0]?.total ?? 0, value.page, 50);
}

const metric = z.number().int().nonnegative();
const statsSchema = z.array(
  z.object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    downloads: metric,
    views: metric,
    iconExports: metric,
    remixes: metric,
    setupCompletions: metric,
  }),
);

export async function getAdminTheme(id: string): Promise<AdminThemeEditorDTO | null> {
  await requireAdmin();
  const validId = themeIdSchema.parse(id);
  const { db } = await import('../../db');
  const [row] = await db
    .select({
      ...themeColumns,
      spec: themes.spec,
      descriptionEn: themes.descriptionEn,
      descriptionAr: themes.descriptionAr,
      rejectionReason: themes.rejectionReason,
    })
    .from(themes)
    .where(eq(themes.id, validId))
    .limit(1);
  if (!row) return null;
  const [hydrated, history, stats] = await Promise.all([
    hydrateThemes([row]),
    db
      .select(auditColumns)
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorId))
      .where(and(eq(auditLog.entityType, 'theme'), eq(auditLog.entityId, validId)))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(100),
    db.execute(statsSql(validId)),
  ]);
  const summary = hydrated[0];
  if (!summary) return null;
  return {
    ...summary,
    spec: themeSpecSchema.parse(row.spec),
    descriptionEn: row.descriptionEn,
    descriptionAr: row.descriptionAr,
    rejectionReason: row.rejectionReason,
    assets: row.assets,
    previewHomeUrl: row.assets ? cdnUrl(row.assets.previewHome) : null,
    previewLockUrl: row.assets ? cdnUrl(row.assets.previewLock) : null,
    ogUrl: row.assets ? cdnUrl(row.assets.og) : null,
    wallpapers: (['phone', 'tablet', 'desktop'] as const).flatMap((size) => {
      const asset = row.assets?.wallpapers[size];
      return asset
        ? [{ size, url: cdnUrl(asset.key), w: asset.w, h: asset.h, bytes: asset.bytes }]
        : [];
    }),
    history: history.map(auditDto),
    stats: statsSchema.parse(stats.rows),
  };
}

export async function getAdminThemeOptions(): Promise<AdminThemeOptions> {
  await requireAdmin();
  const { db } = await import('../../db');
  const [tagRows, collectionRows, runRows] = await Promise.all([
    db
      .select({
        id: tags.id,
        slug: tags.slug,
        kind: tags.kind,
        nameEn: tags.nameEn,
        nameAr: tags.nameAr,
        isActive: tags.isActive,
      })
      .from(tags)
      .orderBy(asc(tags.kind), asc(tags.sortOrder), asc(tags.slug))
      .limit(1000),
    db
      .select({ id: collections.id, titleEn: collections.titleEn, titleAr: collections.titleAr })
      .from(collections)
      .where(or(eq(collections.kind, 'editorial'), eq(collections.kind, 'seasonal')))
      .orderBy(asc(collections.titleEn), asc(collections.id))
      .limit(500),
    db
      .select({
        id: generationRuns.id,
        aesthetic: generationRuns.aesthetic,
        startedAt: generationRuns.startedAt,
      })
      .from(generationRuns)
      .orderBy(desc(generationRuns.startedAt), desc(generationRuns.id))
      .limit(100),
  ]);
  return {
    tags: tagRows,
    collections: collectionRows,
    runs: runRows.map((row) => ({ ...row, startedAt: row.startedAt.toISOString() })),
  };
}
