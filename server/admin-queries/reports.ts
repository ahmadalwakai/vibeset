import 'server-only';

import { and, count, desc, eq, ne } from 'drizzle-orm';
import { user } from '../../db/schema/auth';
import { reports } from '../../db/schema/moderation';
import { themes } from '../../db/schema/themes';
import type { AdminPage } from '../../lib/admin';
import type { AdminReportDetail, AdminReportRow } from '../../lib/admin-moderation';
import { themeSpecSchema } from '../../lib/render/spec';
import { themeIdSchema } from '../../lib/theme-status';
import { adminReportQuerySchema } from '../../lib/validation/admin-moderation';
import { adminQueryInput } from '../../lib/validation/admin-queries';
import { requireAdmin } from '../guards';
import { cdnUrl } from '../storage/urls';
import { offsetPage } from './admin-shared';

const columns = {
  id: reports.id,
  reason: reports.reason,
  details: reports.details,
  status: reports.status,
  createdAt: reports.createdAt,
  resolvedAt: reports.resolvedAt,
  resolutionNote: reports.resolutionNote,
  reporterId: user.id,
  reporterEmail: user.email,
  themeId: themes.id,
  slug: themes.slug,
  nameEn: themes.nameEn,
  nameAr: themes.nameAr,
  themeStatus: themes.status,
  ownerId: themes.ownerId,
  assets: themes.assets,
};
type Row = Pick<
  typeof reports.$inferSelect,
  'id' | 'reason' | 'details' | 'status' | 'createdAt' | 'resolvedAt' | 'resolutionNote'
> & {
  reporterId: string | null;
  reporterEmail: string | null;
  themeId: string;
  slug: string;
  nameEn: string;
  nameAr: string | null;
  themeStatus: typeof themes.$inferSelect.status;
  ownerId: string | null;
  assets: typeof themes.$inferSelect.assets;
};
function dto(row: Row): AdminReportRow {
  const email = row.reporterEmail;
  return {
    id: row.id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolutionNote: row.resolutionNote,
    reporter:
      row.reporterId && email
        ? {
            id: row.reporterId,
            maskedEmail: `${email.slice(0, 1)}***@${email.split('@')[1] ?? '***'}`,
          }
        : null,
    theme: {
      id: row.themeId,
      slug: row.slug,
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      status: row.themeStatus,
      ownerId: row.ownerId,
      thumbUrl: row.assets?.thumb ? cdnUrl(row.assets.thumb) : null,
      previewHomeUrl: row.assets?.previewHome ? cdnUrl(row.assets.previewHome) : null,
      previewLockUrl: row.assets?.previewLock ? cdnUrl(row.assets.previewLock) : null,
    },
  };
}
export async function listAdminReports(input: unknown = {}): Promise<AdminPage<AdminReportRow>> {
  await requireAdmin();
  const value = adminReportQuerySchema.parse(adminQueryInput(input));
  const { db } = await import('../../db');
  const where = eq(reports.status, value.status);
  const [rows, totals] = await Promise.all([
    db
      .select(columns)
      .from(reports)
      .innerJoin(themes, eq(themes.id, reports.themeId))
      .leftJoin(user, eq(user.id, reports.reporterId))
      .where(where)
      .orderBy(desc(reports.createdAt), desc(reports.id))
      .limit(50)
      .offset((value.page - 1) * 50),
    db.select({ total: count() }).from(reports).where(where),
  ]);
  return offsetPage(rows.map(dto), totals[0]?.total ?? 0, value.page, 50);
}
export async function getAdminReport(id: string): Promise<AdminReportDetail | null> {
  await requireAdmin();
  const validId = themeIdSchema.parse(id);
  const { db } = await import('../../db');
  const [row] = await db
    .select({ ...columns, spec: themes.spec })
    .from(reports)
    .innerJoin(themes, eq(themes.id, reports.themeId))
    .leftJoin(user, eq(user.id, reports.reporterId))
    .where(eq(reports.id, validId))
    .limit(1);
  if (!row) return null;
  const others = await db
    .select(columns)
    .from(reports)
    .innerJoin(themes, eq(themes.id, reports.themeId))
    .leftJoin(user, eq(user.id, reports.reporterId))
    .where(and(eq(reports.themeId, row.themeId), ne(reports.id, row.id)))
    .orderBy(desc(reports.createdAt), desc(reports.id))
    .limit(50);
  return { ...dto(row), themeSpec: themeSpecSchema.parse(row.spec), otherReports: others.map(dto) };
}
