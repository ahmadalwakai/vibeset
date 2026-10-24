import 'server-only';

import { and, count, desc, eq, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { themes } from '../../db/schema/themes';
import type { AdminPage, AdminThemeRow } from '../../lib/admin';
import { adminPublishQuerySchema, adminQueryInput } from '../../lib/validation/admin-queries';
import { requireAdmin } from '../guards';
import { hydrateThemes, offsetPage, staleSql, themeColumns } from './admin-shared';

export async function listAdminPublish(input: unknown = {}): Promise<AdminPage<AdminThemeRow>> {
  await requireAdmin();
  const value = adminPublishQuerySchema.parse(adminQueryInput(input));
  const { db } = await import('../../db');
  const candidates: Record<Exclude<typeof value.kind, 'all'>, SQL | undefined> = {
    approved: and(
      eq(themes.status, 'approved'),
      eq(themes.assetVersion, 0),
      isNull(themes.publishedAt),
    ),
    stale: and(eq(themes.status, 'published'), staleSql),
    archived: eq(themes.status, 'archived'),
    failed: and(isNotNull(themes.publishError), sql`${themes.publishError} <> ''`),
  };
  const where = value.kind === 'all' ? or(...Object.values(candidates)) : candidates[value.kind];
  const [rows, totals] = await Promise.all([
    db
      .select(themeColumns)
      .from(themes)
      .where(where)
      .orderBy(desc(themes.updatedAt), desc(themes.id))
      .limit(50)
      .offset((value.page - 1) * 50),
    db.select({ total: count() }).from(themes).where(where),
  ]);
  return offsetPage(await hydrateThemes(rows), totals[0]?.total ?? 0, value.page, 50);
}
