import 'server-only';

import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { user } from '../../db/schema/auth';
import { creatorProfiles } from '../../db/schema/moderation';
import type { AdminPage } from '../../lib/admin';
import type { AdminUserDetail, AdminUserRow } from '../../lib/admin-moderation';
import { adminUserIdSchema, adminUserQuerySchema } from '../../lib/validation/admin-moderation';
import { adminQueryInput } from '../../lib/validation/admin-queries';
import { requireAdmin } from '../guards';
import { offsetPage } from './admin-shared';

const columns = {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  banned: user.banned,
  banReason: user.banReason,
  banExpires: user.banExpires,
  createdAt: user.createdAt,
  handle: creatorProfiles.handle,
  creatorStatus: creatorProfiles.status,
};
type Row = Pick<
  typeof user.$inferSelect,
  'id' | 'name' | 'email' | 'role' | 'banned' | 'banReason' | 'banExpires' | 'createdAt'
> & { handle: string | null; creatorStatus: typeof creatorProfiles.$inferSelect.status | null };
function dto(row: Row): AdminUserRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role === 'admin' ? 'admin' : 'user',
    banned: !!row.banned,
    banReason: row.banReason,
    banExpires: row.banExpires?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    creator:
      row.handle && row.creatorStatus ? { handle: row.handle, status: row.creatorStatus } : null,
  };
}
export async function listAdminUsers(input: unknown = {}): Promise<AdminPage<AdminUserRow>> {
  await requireAdmin();
  const value = adminUserQuerySchema.parse(adminQueryInput(input));
  const { db } = await import('../../db');
  const text = value.q ? `%${value.q.replace(/[\\%_]/g, '\\$&')}%` : undefined;
  const where = and(
    text ? or(ilike(user.email, text), ilike(user.name, text)) : undefined,
    value.role
      ? value.role === 'user'
        ? sql`coalesce(${user.role},'user')='user'`
        : eq(user.role, value.role)
      : undefined,
    value.banned === undefined ? undefined : sql`coalesce(${user.banned},false)=${value.banned}`,
    value.creatorStatus ? eq(creatorProfiles.status, value.creatorStatus) : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select(columns)
      .from(user)
      .leftJoin(creatorProfiles, eq(user.id, creatorProfiles.userId))
      .where(where)
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(50)
      .offset((value.page - 1) * 50),
    db
      .select({ total: count() })
      .from(user)
      .leftJoin(creatorProfiles, eq(user.id, creatorProfiles.userId))
      .where(where),
  ]);
  return offsetPage(rows.map(dto), totals[0]?.total ?? 0, value.page, 50);
}
export async function getAdminUser(userId: string): Promise<AdminUserDetail | null> {
  await requireAdmin();
  const id = adminUserIdSchema.parse(userId);
  const { db } = await import('../../db');
  const [row] = await db
    .select({
      ...columns,
      emailVerified: user.emailVerified,
      locale: user.locale,
      favorites: sql<number>`(SELECT count(*)::int FROM favorites WHERE user_id=${user.id})`,
      collections: sql<number>`(SELECT count(*)::int FROM collections WHERE owner_id=${user.id})`,
      remixes: sql<number>`(SELECT count(*)::int FROM themes WHERE owner_id=${user.id} AND source='remix')`,
      themes: sql<number>`(SELECT count(*)::int FROM themes WHERE owner_id=${user.id} AND source<>'remix')`,
    })
    .from(user)
    .leftJoin(creatorProfiles, eq(user.id, creatorProfiles.userId))
    .where(eq(user.id, id))
    .limit(1);
  return row
    ? {
        ...dto(row),
        emailVerified: row.emailVerified,
        locale: row.locale ?? 'en',
        counts: {
          favorites: row.favorites,
          collections: row.collections,
          remixes: row.remixes,
          themes: row.themes,
        },
      }
    : null;
}
