import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';
import { themes } from '../../db/schema/themes';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { favorites, themeStatsDaily } from '../../db/schema/engagement';
import type {
  CreatorContext,
  CreatorDashboard,
  CreatorThemeSummary,
  CreatorThemeEditorDTO,
} from '../../lib/creator';
import type { Paginated } from '../../lib/dto';
import { themeSpecSchema } from '../../lib/render/spec';
import { THEME_STATUSES, themeIdSchema } from '../../lib/theme-status';
import { decodeCursor, encodeCursor } from '../../lib/utils/cursor';
import { creatorDashboardSchema, listCreatorThemesSchema } from '../../lib/validation/creator';
import { requireCreator, requireUser } from '../guards';
import { cdnUrl } from '../storage/urls';

const columns = {
  id: themes.id,
  slug: themes.slug,
  nameEn: themes.nameEn,
  nameAr: themes.nameAr,
  status: themes.status,
  source: themes.source,
  assets: themes.assets,
  rejectionReason: themes.rejectionReason,
  updatedAt: themes.updatedAt,
  createdAt: themes.createdAt,
};
type SummaryRow = { [K in keyof typeof columns]: (typeof themes.$inferSelect)[K] };
function summary(row: SummaryRow): CreatorThemeSummary {
  return {
    id: row.id,
    slug: row.slug,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    status: row.status,
    source: row.source,
    thumbUrl: row.assets?.thumb ? cdnUrl(row.assets.thumb) : null,
    rejectionReason: row.rejectionReason,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getMyCreatorContext(): Promise<CreatorContext | null> {
  const session = await requireUser();
  return (await import('../services/creators')).getCreatorContext(session.user.id);
}
export async function listMyCreatorThemes(
  input: { status?: CreatorThemeSummary['status']; cursor?: string } = {},
): Promise<Paginated<CreatorThemeSummary>> {
  const session = await requireCreator(),
    value = listCreatorThemesSchema.parse(input),
    cursor = value.cursor ? decodeCursor(value.cursor, 'new') : null;
  const { db } = await import('../../db');
  const rows = await db
    .select({
      ...columns,
      cursorTime: sql<string>`to_char(${themes.createdAt} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    })
    .from(themes)
    .where(
      and(
        eq(themes.ownerId, session.user.id),
        value.status ? eq(themes.status, value.status) : undefined,
        cursor
          ? sql`(${themes.createdAt},${themes.id})<(${cursor.s}::timestamptz,${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(themes.createdAt), desc(themes.id))
    .limit(25);
  const page = rows.slice(0, 24),
    last = page.at(-1);
  return {
    items: page.map(summary),
    nextCursor:
      rows.length > 24 && last ? encodeCursor({ k: 'new', s: last.cursorTime, id: last.id }) : null,
  };
}
export async function getMyCreatorTheme(id: string): Promise<CreatorThemeEditorDTO | null> {
  const session = await requireCreator(),
    validId = themeIdSchema.parse(id),
    { db } = await import('../../db');
  const [row] = await db
    .select({
      ...columns,
      spec: themes.spec,
      descriptionEn: themes.descriptionEn,
      descriptionAr: themes.descriptionAr,
    })
    .from(themes)
    .where(and(eq(themes.id, validId), eq(themes.ownerId, session.user.id)))
    .limit(1);
  if (!row) return null;
  const memberships = await db
    .select({ slug: tags.slug })
    .from(themeTags)
    .innerJoin(tags, eq(themeTags.tagId, tags.id))
    .where(eq(themeTags.themeId, row.id))
    .orderBy(tags.slug);
  return {
    ...summary(row),
    spec: themeSpecSchema.parse(row.spec),
    descriptionEn: row.descriptionEn,
    descriptionAr: row.descriptionAr,
    tagSlugs: memberships.map(({ slug }) => slug),
  };
}
export async function getCreatorDashboard(
  input: { days: 7 | 30 } = { days: 7 },
): Promise<CreatorDashboard> {
  const session = await requireCreator(),
    { days } = creatorDashboardSchema.parse(input),
    { db } = await import('../../db');
  const owner = eq(themes.ownerId, session.user.id);
  const [countsRows, favoriteRows, statsRows, topRows, rejectionRows] = await Promise.all([
    db
      .select({ status: themes.status, count: sql<number>`count(*)::int` })
      .from(themes)
      .where(owner)
      .groupBy(themes.status),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(favorites)
      .innerJoin(themes, eq(favorites.themeId, themes.id))
      .where(and(owner, eq(themes.status, 'published'))),
    db
      .select({
        views: sql<number>`coalesce(sum(${themeStatsDaily.views}),0)::int`,
        downloads: sql<number>`coalesce(sum(${themeStatsDaily.downloads}),0)::int`,
        iconExports: sql<number>`coalesce(sum(${themeStatsDaily.iconExports}),0)::int`,
        remixes: sql<number>`coalesce(sum(${themeStatsDaily.remixes}),0)::int`,
        setupCompletions: sql<number>`coalesce(sum(${themeStatsDaily.setupCompletions}),0)::int`,
      })
      .from(themeStatsDaily)
      .innerJoin(themes, eq(themeStatsDaily.themeId, themes.id))
      .where(
        and(
          owner,
          sql`${themeStatsDaily.day} >= ((now() AT TIME ZONE 'UTC')::date - (${days}::int - 1)) AND ${themeStatsDaily.day} <= (now() AT TIME ZONE 'UTC')::date`,
        ),
      ),
    db
      .select(columns)
      .from(themes)
      .where(and(owner, eq(themes.status, 'published')))
      .orderBy(desc(themes.downloadCount), desc(themes.id))
      .limit(5),
    db
      .select(columns)
      .from(themes)
      .where(and(owner, eq(themes.status, 'rejected')))
      .orderBy(desc(themes.updatedAt), desc(themes.id))
      .limit(5),
  ]);
  const counts = Object.fromEntries(
    THEME_STATUSES.map((status) => [
      status,
      countsRows.find((row) => row.status === status)?.count ?? 0,
    ]),
  ) as CreatorDashboard['counts'];
  return {
    counts,
    currentFavorites: favoriteRows[0]?.count ?? 0,
    days,
    stats: statsRows[0] ?? {
      views: 0,
      downloads: 0,
      iconExports: 0,
      remixes: 0,
      setupCompletions: 0,
    },
    topThemes: topRows.map(summary),
    latestRejections: rejectionRows.map(summary),
  };
}
