import 'server-only';

import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { user } from '../../db/schema/auth';
import { creatorProfiles } from '../../db/schema/moderation';
import type { AdminPage } from '../../lib/admin';
import type { AdminCreatorRow } from '../../lib/admin-moderation';
import { adminCreatorQuerySchema, adminUserIdSchema } from '../../lib/validation/admin-moderation';
import { adminQueryInput } from '../../lib/validation/admin-queries';
import { requireAdmin } from '../guards';
import { cdnUrl } from '../storage/urls';
import { offsetPage } from './admin-shared';

const columns = {
  profile: creatorProfiles,
  email: user.email,
  banned: user.banned,
  accountCreatedAt: user.createdAt,
  themeCount: sql<number>`(SELECT count(*)::int FROM themes WHERE owner_id=${creatorProfiles.userId} AND source<>'remix')`,
  publishedCount: sql<number>`(SELECT count(*)::int FROM themes WHERE owner_id=${creatorProfiles.userId} AND status='published')`,
  downloads30d: sql<number>`(SELECT coalesce(sum(s.downloads),0)::int FROM theme_stats_daily s JOIN themes t ON t.id=s.theme_id
    WHERE t.owner_id=${creatorProfiles.userId} AND s.day >= ((now() AT TIME ZONE 'UTC')::date - 29))`,
};
type Row = {
  profile: typeof creatorProfiles.$inferSelect;
  email: string;
  banned: boolean | null;
  accountCreatedAt: Date;
  themeCount: number;
  publishedCount: number;
  downloads30d: number;
};
function dto(row: Row): AdminCreatorRow {
  const p = row.profile;
  return {
    userId: p.userId,
    email: row.email,
    banned: !!row.banned,
    accountCreatedAt: row.accountCreatedAt.toISOString(),
    handle: p.handle,
    displayName: p.displayName,
    bio: p.bio,
    avatarUrl: p.avatarKey ? cdnUrl(p.avatarKey) : null,
    links: p.links,
    isAdult: p.isAdult,
    status: p.status,
    appliedAt: p.appliedAt.toISOString(),
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    rejectionReason: p.rejectionReason,
    themeCount: row.themeCount,
    publishedCount: row.publishedCount,
    downloads30d: row.downloads30d,
  };
}
export async function listAdminCreators(input: unknown = {}): Promise<AdminPage<AdminCreatorRow>> {
  await requireAdmin();
  const value = adminCreatorQuerySchema.parse(adminQueryInput(input));
  const { db } = await import('../../db');
  const text = value.q ? `%${value.q.replace(/[\\%_]/g, '\\$&')}%` : undefined;
  const where = and(
    value.status === 'all' ? undefined : eq(creatorProfiles.status, value.status),
    text
      ? or(
          ilike(creatorProfiles.handle, text),
          ilike(creatorProfiles.displayName, text),
          ilike(user.email, text),
        )
      : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select(columns)
      .from(creatorProfiles)
      .innerJoin(user, eq(user.id, creatorProfiles.userId))
      .where(where)
      .orderBy(desc(creatorProfiles.appliedAt), desc(creatorProfiles.userId))
      .limit(50)
      .offset((value.page - 1) * 50),
    db
      .select({ total: count() })
      .from(creatorProfiles)
      .innerJoin(user, eq(user.id, creatorProfiles.userId))
      .where(where),
  ]);
  return offsetPage(rows.map(dto), totals[0]?.total ?? 0, value.page, 50);
}
export async function getAdminCreator(userId: string): Promise<AdminCreatorRow | null> {
  await requireAdmin();
  const id = adminUserIdSchema.parse(userId);
  const { db } = await import('../../db');
  const [row] = await db
    .select(columns)
    .from(creatorProfiles)
    .innerJoin(user, eq(user.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.userId, id))
    .limit(1);
  return row ? dto(row) : null;
}
