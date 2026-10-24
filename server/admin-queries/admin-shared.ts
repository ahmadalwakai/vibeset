import 'server-only';

import { eq, inArray, sql, type SQL } from 'drizzle-orm';
import { user } from '../../db/schema/auth';
import { creatorProfiles } from '../../db/schema/moderation';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { themes } from '../../db/schema/themes';
import type { AdminAuditEntry, AdminPage, AdminThemeRow } from '../../lib/admin';
import { auditLog } from '../../db/schema/system';
import { cdnUrl } from '../storage/urls';

export const staleSql = sql<boolean>`${themes.assetVersion} > 0 AND ${themes.assetsSpecHash} IS DISTINCT FROM ${themes.specHash}`;
export const themeColumns = {
  id: themes.id,
  slug: themes.slug,
  nameEn: themes.nameEn,
  nameAr: themes.nameAr,
  status: themes.status,
  source: themes.source,
  assets: themes.assets,
  isFeatured: themes.isFeatured,
  specHash: themes.specHash,
  assetsSpecHash: themes.assetsSpecHash,
  assetVersion: themes.assetVersion,
  publishError: themes.publishError,
  generationRunId: themes.generationRunId,
  colorFamily: themes.colorFamily,
  downloadCount: themes.downloadCount,
  favoriteCount: themes.favoriteCount,
  popularity: themes.popularity,
  ownerId: themes.ownerId,
  createdAt: themes.createdAt,
  updatedAt: themes.updatedAt,
  publishedAt: themes.publishedAt,
};
export type AdminThemeSource = Pick<typeof themes.$inferSelect, keyof typeof themeColumns>;

/** Internal projection helper. Public callers must establish their own admin guard first. */
export async function hydrateThemes(rows: AdminThemeSource[]): Promise<AdminThemeRow[]> {
  if (!rows.length) return [];
  const { db } = await import('../../db');
  const ownerIds = [...new Set(rows.flatMap((row) => (row.ownerId ? [row.ownerId] : [])))];
  const [memberships, owners] = await Promise.all([
    db
      .select({
        themeId: themeTags.themeId,
        id: tags.id,
        slug: tags.slug,
        kind: tags.kind,
        nameEn: tags.nameEn,
        nameAr: tags.nameAr,
        isActive: tags.isActive,
      })
      .from(themeTags)
      .innerJoin(tags, eq(themeTags.tagId, tags.id))
      .where(
        inArray(
          themeTags.themeId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(tags.slug),
    ownerIds.length
      ? db
          .select({
            id: user.id,
            name: user.name,
            handle: creatorProfiles.handle,
            creatorStatus: creatorProfiles.status,
          })
          .from(user)
          .leftJoin(creatorProfiles, eq(user.id, creatorProfiles.userId))
          .where(inArray(user.id, ownerIds))
      : [],
  ]);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    status: row.status,
    source: row.source,
    thumbUrl: row.assets?.thumb ? cdnUrl(row.assets.thumb) : null,
    isFeatured: row.isFeatured,
    stale: row.assetVersion > 0 && row.assetsSpecHash !== row.specHash,
    specHash: row.specHash,
    assetsSpecHash: row.assetsSpecHash,
    assetVersion: row.assetVersion,
    publishError: row.publishError,
    generationRunId: row.generationRunId,
    colorFamily: row.colorFamily,
    downloadCount: row.downloadCount,
    favoriteCount: row.favoriteCount,
    popularity: row.popularity,
    owner: owners.find((owner) => owner.id === row.ownerId) ?? null,
    tags: memberships
      .filter((item) => item.themeId === row.id)
      .map((item) => ({
        id: item.id,
        slug: item.slug,
        kind: item.kind,
        nameEn: item.nameEn,
        nameAr: item.nameAr,
        isActive: item.isActive,
      })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
  }));
}

export function offsetPage<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): AdminPage<T> {
  return { items, total, page, pageSize, nextPage: page * pageSize < total ? page + 1 : null };
}

export const auditColumns = {
  id: auditLog.id,
  actorId: auditLog.actorId,
  actorName: user.name,
  action: auditLog.action,
  entityType: auditLog.entityType,
  entityId: auditLog.entityId,
  meta: auditLog.meta,
  createdAt: auditLog.createdAt,
};
export function auditDto(
  row: typeof auditLog.$inferSelect & { actorName: string | null },
): AdminAuditEntry {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/** UTC dates are generated in PostgreSQL, including days with no observations. */
export function statsSql(themeId?: string): SQL {
  return sql`
    SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
      coalesce(sum(stats.downloads),0)::int AS downloads,
      coalesce(sum(stats.views),0)::int AS views,
      coalesce(sum(stats.icon_exports),0)::int AS "iconExports",
      coalesce(sum(stats.remixes),0)::int AS remixes,
      coalesce(sum(stats.setup_completions),0)::int AS "setupCompletions"
    FROM generate_series((now() AT TIME ZONE 'UTC')::date - 29,
      (now() AT TIME ZONE 'UTC')::date, interval '1 day') AS days(day)
    LEFT JOIN theme_stats_daily stats ON stats.day = days.day::date
      ${themeId ? sql`AND stats.theme_id = ${themeId}::uuid` : sql``}
    GROUP BY days.day ORDER BY days.day ASC
  `;
}
