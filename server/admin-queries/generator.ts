import 'server-only';

import { and, count, desc, eq } from 'drizzle-orm';
import { AESTHETICS } from '../../content/aesthetics';
import { user } from '../../db/schema/auth';
import { generationRuns } from '../../db/schema/system';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { themes } from '../../db/schema/themes';
import type { AdminPage } from '../../lib/admin';
import type {
  AdminGenerationRun,
  AdminGenerationRunDetail,
  AdminGeneratorOption,
} from '../../lib/admin-operations';
import { THEME_STATUSES } from '../../lib/theme-status';
import {
  adminGenerationQuerySchema,
  adminGenerationReadSchema,
} from '../../lib/validation/admin-operations';
import { adminQueryInput } from '../../lib/validation/admin-queries';
import { requireAdmin } from '../guards';
import { offsetPage } from './admin-shared';

const runColumns = {
  id: generationRuns.id,
  aesthetic: generationRuns.aesthetic,
  seed: generationRuns.seed,
  requested: generationRuns.requested,
  created: generationRuns.created,
  skippedDuplicates: generationRuns.skippedDuplicates,
  skippedQa: generationRuns.skippedQa,
  status: generationRuns.status,
  actorId: generationRuns.actorId,
  actorName: user.name,
  startedAt: generationRuns.startedAt,
  finishedAt: generationRuns.finishedAt,
};
function runDto(
  row: Omit<AdminGenerationRun, 'startedAt' | 'finishedAt'> & {
    startedAt: Date;
    finishedAt: Date | null;
  },
): AdminGenerationRun {
  return {
    ...row,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}
export async function getAdminGeneratorOptions(): Promise<AdminGeneratorOption[]> {
  await requireAdmin();
  const { db } = await import('../../db');
  const rows = await db
    .select({ slug: tags.slug, status: themes.status, total: count() })
    .from(tags)
    .innerJoin(themeTags, eq(tags.id, themeTags.tagId))
    .innerJoin(themes, eq(themeTags.themeId, themes.id))
    .where(eq(tags.kind, 'aesthetic'))
    .groupBy(tags.slug, themes.status);
  return AESTHETICS.map((recipe) => ({
    slug: recipe.slug,
    nameEn: recipe.nameEn,
    nameAr: recipe.nameAr,
    counts: Object.fromEntries(
      THEME_STATUSES.map((status) => [
        status,
        rows.find((row) => row.slug === recipe.slug && row.status === status)?.total ?? 0,
      ]),
    ) as AdminGeneratorOption['counts'],
  }));
}
export async function listAdminGenerationRuns(
  raw: unknown = {},
): Promise<AdminPage<AdminGenerationRun>> {
  await requireAdmin();
  const query = adminGenerationQuerySchema.parse(adminQueryInput(raw));
  const { db } = await import('../../db');
  const where = query.aesthetic ? eq(generationRuns.aesthetic, query.aesthetic) : undefined;
  const [rows, totals] = await Promise.all([
    db
      .select(runColumns)
      .from(generationRuns)
      .leftJoin(user, eq(generationRuns.actorId, user.id))
      .where(where)
      .orderBy(desc(generationRuns.startedAt), desc(generationRuns.id))
      .limit(20)
      .offset((query.page - 1) * 20),
    db.select({ total: count() }).from(generationRuns).where(where),
  ]);
  return offsetPage(rows.map(runDto), totals[0]?.total ?? 0, query.page, 20);
}
export async function getAdminGenerationRun(id: string): Promise<AdminGenerationRunDetail | null> {
  await requireAdmin();
  const value = adminGenerationReadSchema.parse({ id });
  const { db } = await import('../../db');
  const [row] = await db
    .select({ ...runColumns, log: generationRuns.log })
    .from(generationRuns)
    .leftJoin(user, eq(generationRuns.actorId, user.id))
    .where(and(eq(generationRuns.id, value.id)))
    .limit(1);
  return row
    ? { ...runDto(row), log: row.log.slice(0, 100).map((line) => line.slice(0, 2000)) }
    : null;
}
