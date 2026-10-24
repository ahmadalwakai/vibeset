import 'server-only';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { user } from '../../db/schema/auth';
import { collectionItems, collections } from '../../db/schema/collections';
import { creatorProfiles } from '../../db/schema/moderation';
import { themes } from '../../db/schema/themes';
import { CacheTags } from '../../lib/cache-tags';
import type { AdminPrincipal, AdminTransaction } from './admin-access';
import { AppError } from '../errors';
import { transitionStatements } from './theme-status';

/** Acquire before any actor/target row lock, including composed report resolutions. */
export async function moderationLock(tx: AdminTransaction): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('vibeset:admin-roles',0))`);
}
export async function moderationUser(
  tx: AdminTransaction,
  id: string,
): Promise<typeof user.$inferSelect> {
  const [row] = await tx.select().from(user).where(eq(user.id, id)).for('update');
  if (!row) throw new AppError('NOT_FOUND');
  return row;
}
/** Shared state-machine statements retain each theme's atomic transition audit. */
export async function archiveThemeRows(
  tx: AdminTransaction,
  rows: (typeof themes.$inferSelect)[],
  actor: AdminPrincipal,
): Promise<{ archived: number; tags: string[] }> {
  if (!rows.length) return { archived: 0, tags: [] };
  const ids = rows.map((row) => row.id),
    owners = [...new Set(rows.flatMap((row) => (row.ownerId ? [row.ownerId] : [])))];
  const [memberships, creators] = await Promise.all([
    tx
      .select({ slug: collections.slug })
      .from(collectionItems)
      .innerJoin(collections, eq(collectionItems.collectionId, collections.id))
      .where(inArray(collectionItems.themeId, ids)),
    owners.length
      ? tx
          .select({ handle: creatorProfiles.handle })
          .from(creatorProfiles)
          .where(inArray(creatorProfiles.userId, owners))
      : [],
  ]);
  for (const row of rows) {
    const [statement] = transitionStatements(row, 'archived', actor);
    if ((await tx.execute(statement)).rows.length !== 1) throw new AppError('CONFLICT');
  }
  return {
    archived: rows.length,
    tags: [
      ...new Set([
        CacheTags.themes,
        CacheTags.collections,
        ...rows.map((row) => CacheTags.theme(row.slug)),
        ...memberships.flatMap((row) => (row.slug ? [CacheTags.collection(row.slug)] : [])),
        ...creators.map((row) => CacheTags.creator(row.handle)),
      ]),
    ],
  };
}
export async function archiveOwnedThemes(
  tx: AdminTransaction,
  ownerId: string,
  actor: AdminPrincipal,
): Promise<{ archived: number; tags: string[] }> {
  const rows = await tx
    .select()
    .from(themes)
    .where(and(eq(themes.ownerId, ownerId), eq(themes.status, 'published')))
    .orderBy(asc(themes.id))
    .for('update');
  return archiveThemeRows(tx, rows, actor);
}
