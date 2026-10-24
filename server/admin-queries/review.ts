import 'server-only';

import { and, asc, count, eq, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { themes } from '../../db/schema/themes';
import type { AdminDuplicateSummary, AdminReviewItem, AdminReviewPage } from '../../lib/admin';
import { qaSpec } from '../../lib/render/qa';
import { themeSpecSchema, type ThemeSpec } from '../../lib/render/spec';
import { themeIdSchema } from '../../lib/theme-status';
import {
  adminQueryInput,
  adminReviewQuerySchema,
  decodeAdminReviewCursor,
  encodeAdminReviewCursor,
} from '../../lib/validation/admin-queries';
import { requireAdmin } from '../guards';
import { createAdminReviewVersion } from '../admin-review-version';
import { loadGeneratorManifest } from '../render/generator-preview';
import { hydrateThemes, themeColumns, type AdminThemeSource } from './admin-shared';

const priority = sql<number>`CASE WHEN ${themes.status}='pending_review' THEN 0 ELSE 1 END`;
const eligible = or(
  eq(themes.status, 'pending_review'),
  and(eq(themes.status, 'draft'), eq(themes.source, 'generated')),
);
const projection = {
  ...themeColumns,
  spec: themes.spec,
  cursorPriority: priority,
  cursorTime: sql<string>`to_char(${themes.createdAt} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  revisionTime: sql<string>`to_char((CASE WHEN ${themes.status}='pending_review'
    THEN coalesce(${themes.submittedAt},${themes.createdAt}) ELSE ${themes.updatedAt} END)
    AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
};
type ReviewRow = AdminThemeSource & {
  spec: ThemeSpec;
  cursorPriority: number;
  cursorTime: string;
  revisionTime: string;
};
const duplicateSchema = z.array(
  z.object({
    themeId: z.uuid(),
    duplicate: z
      .object({
        id: z.uuid(),
        nameEn: z.string(),
        nameAr: z.string().nullable(),
        distance: z.number().int().min(0).max(64),
      })
      .nullable(),
  }),
);

async function nearestDuplicates(
  ids: string[],
): Promise<Map<string, AdminDuplicateSummary | null>> {
  if (!ids.length) return new Map();
  const { db } = await import('../../db');
  const result = await db.execute(sql`
    SELECT target.id AS "themeId", CASE WHEN nearest.id IS NULL THEN NULL ELSE
      json_build_object('id',nearest.id,'nameEn',nearest.name_en,'nameAr',nearest.name_ar,'distance',nearest.distance) END AS duplicate
    FROM themes target LEFT JOIN LATERAL (
      SELECT other.id,other.name_en,other.name_ar,
        CASE WHEN target.preview_hash ~ '^[a-fA-F0-9]{16}$' AND other.preview_hash ~ '^[a-fA-F0-9]{16}$'
          THEN bit_count(('x'||target.preview_hash)::bit(64) # ('x'||other.preview_hash)::bit(64)) END AS distance
      FROM themes other WHERE other.id<>target.id AND other.status<>'rejected'
        AND target.preview_hash ~ '^[a-fA-F0-9]{16}$' AND other.preview_hash ~ '^[a-fA-F0-9]{16}$'
      ORDER BY distance ASC,other.id ASC LIMIT 1
    ) nearest ON true WHERE target.id IN (${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
  `);
  return new Map(duplicateSchema.parse(result.rows).map((row) => [row.themeId, row.duplicate]));
}

async function reviewItems(
  rows: ReviewRow[],
  manifest: ReadonlySet<string>,
): Promise<AdminReviewItem[]> {
  const [summaries, duplicates] = await Promise.all([
    hydrateThemes(rows),
    nearestDuplicates(rows.map((row) => row.id)),
  ]);
  return Promise.all(
    summaries.map(async (summary, index) => {
      const row = rows[index];
      if (!row) throw new Error('Missing review projection');
      const spec = themeSpecSchema.parse(row.spec);
      return {
        ...summary,
        spec,
        qa: qaSpec(spec, manifest),
        nearestDuplicate: duplicates.get(summary.id) ?? null,
        reviewVersion: await createAdminReviewVersion({
          status: summary.status,
          revisionTime: row.revisionTime,
          specHash: summary.specHash,
        }),
      };
    }),
  );
}

export async function getAdminReviewItem(id: string): Promise<AdminReviewItem | null> {
  await requireAdmin();
  const validId = themeIdSchema.parse(id);
  const { db } = await import('../../db');
  const [rows, manifest] = await Promise.all([
    db
      .select(projection)
      .from(themes)
      .where(and(eq(themes.id, validId), eligible))
      .limit(1),
    loadGeneratorManifest(),
  ]);
  return (await reviewItems(rows, manifest))[0] ?? null;
}

export async function listAdminReview(input: unknown = {}): Promise<AdminReviewPage> {
  await requireAdmin();
  const value = adminReviewQuerySchema.parse(adminQueryInput(input));
  const cursor = value.cursor ? decodeAdminReviewCursor(value.cursor) : null;
  const where = and(
    eligible,
    value.run ? eq(themes.generationRunId, value.run) : undefined,
    value.aesthetic
      ? sql`EXISTS(SELECT 1 FROM theme_tags tt JOIN tags t ON t.id=tt.tag_id
      WHERE tt.theme_id=${themes.id} AND t.kind='aesthetic' AND t.slug=${value.aesthetic})`
      : undefined,
  );
  const after: SQL | undefined = cursor
    ? sql`(${priority},${themes.createdAt},${themes.id}) > (${cursor.priority},${cursor.at}::timestamptz,${cursor.id}::uuid)`
    : undefined;
  const { db } = await import('../../db');
  const [rows, totals, manifest] = await Promise.all([
    db
      .select(projection)
      .from(themes)
      .where(and(where, after))
      .orderBy(asc(priority), asc(themes.createdAt), asc(themes.id))
      .limit(31)
      .offset(cursor ? 0 : (value.page - 1) * 30),
    db.select({ total: count() }).from(themes).where(where),
    loadGeneratorManifest(),
  ]);
  const page = rows.slice(0, 30);
  const last = page.at(-1);
  const hasMore = rows.length > 30;
  return {
    items: await reviewItems(page, manifest),
    total: totals[0]?.total ?? 0,
    page: value.page,
    pageSize: 30,
    nextPage: hasMore ? value.page + 1 : null,
    nextCursor:
      hasMore && last
        ? encodeAdminReviewCursor({
            k: 'admin-review',
            priority: last.cursorPriority === 0 ? 0 : 1,
            at: last.cursorTime,
            id: last.id,
          })
        : null,
  };
}
