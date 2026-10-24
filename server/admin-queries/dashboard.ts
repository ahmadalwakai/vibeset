import 'server-only';

import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { user } from '../../db/schema/auth';
import { auditLog } from '../../db/schema/system';
import type {
  AdminAuditEntry,
  AdminDashboardKpis,
  AdminDownloadPoint,
  AdminTopTheme,
} from '../../lib/admin';
import { themeStatusSchema } from '../../lib/theme-status';
import { requireAdmin } from '../guards';
import { cdnUrl } from '../storage/urls';
import { auditColumns, auditDto, statsSql } from './admin-shared';

const metric = z.number().int().nonnegative();
const kpisSchema = z.object({
  published: metric,
  pendingReview: metric,
  approvedUnpublished: metric,
  stale: metric,
  downloadsToday: metric,
  downloads7d: metric,
  downloads30d: metric,
  newUsers7d: metric,
  openReports: metric,
  pendingCreators: metric,
});

export async function getAdminDashboardKpis(): Promise<AdminDashboardKpis> {
  await requireAdmin();
  const { db } = await import('../../db');
  const result = await db.execute(sql`SELECT
    (SELECT count(*)::int FROM themes WHERE status='published') AS published,
    (SELECT count(*)::int FROM themes WHERE status='pending_review') AS "pendingReview",
    (SELECT count(*)::int FROM themes WHERE status='approved' AND asset_version=0 AND published_at IS NULL) AS "approvedUnpublished",
    (SELECT count(*)::int FROM themes WHERE status='published' AND asset_version>0 AND assets_spec_hash IS DISTINCT FROM spec_hash) AS stale,
    (SELECT coalesce(sum(downloads),0)::int FROM theme_stats_daily WHERE day=(now() AT TIME ZONE 'UTC')::date) AS "downloadsToday",
    (SELECT coalesce(sum(downloads),0)::int FROM theme_stats_daily WHERE day BETWEEN (now() AT TIME ZONE 'UTC')::date-6 AND (now() AT TIME ZONE 'UTC')::date) AS "downloads7d",
    (SELECT coalesce(sum(downloads),0)::int FROM theme_stats_daily WHERE day BETWEEN (now() AT TIME ZONE 'UTC')::date-29 AND (now() AT TIME ZONE 'UTC')::date) AS "downloads30d",
    (SELECT count(*)::int FROM "user" WHERE created_at >= ((now() AT TIME ZONE 'UTC')::date-6)::timestamp) AS "newUsers7d",
    (SELECT count(*)::int FROM reports WHERE status='open') AS "openReports",
    (SELECT count(*)::int FROM creator_profiles WHERE status='pending') AS "pendingCreators"`);
  return kpisSchema.parse(result.rows[0]);
}

export async function getAdminDownloads(): Promise<AdminDownloadPoint[]> {
  await requireAdmin();
  const { db } = await import('../../db');
  const result = await db.execute(statsSql());
  return z
    .array(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), downloads: metric }))
    .parse(result.rows);
}

export async function getAdminTopThemes(): Promise<AdminTopTheme[]> {
  await requireAdmin();
  const { db } = await import('../../db');
  const result =
    await db.execute(sql`SELECT t.id,t.slug,t.name_en AS "nameEn",t.name_ar AS "nameAr",t.status,
    t.assets->>'thumb' AS "thumbKey",sum(s.downloads)::int AS downloads
    FROM themes t JOIN theme_stats_daily s ON s.theme_id=t.id
    WHERE s.day BETWEEN (now() AT TIME ZONE 'UTC')::date-6 AND (now() AT TIME ZONE 'UTC')::date
    GROUP BY t.id HAVING sum(s.downloads)>0 ORDER BY downloads DESC,t.id ASC LIMIT 10`);
  const rows = z
    .array(
      z.object({
        id: z.uuid(),
        slug: z.string(),
        nameEn: z.string(),
        nameAr: z.string().nullable(),
        status: themeStatusSchema,
        thumbKey: z.string().nullable(),
        downloads: metric,
      }),
    )
    .parse(result.rows);
  return rows.map(({ thumbKey, ...row }) => ({
    ...row,
    thumbUrl: thumbKey ? cdnUrl(thumbKey) : null,
  }));
}

export async function getAdminRecentAudit(): Promise<AdminAuditEntry[]> {
  await requireAdmin();
  const { db } = await import('../../db');
  const rows = await db
    .select(auditColumns)
    .from(auditLog)
    .leftJoin(user, eq(auditLog.actorId, user.id))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(20);
  return rows.map(auditDto);
}
