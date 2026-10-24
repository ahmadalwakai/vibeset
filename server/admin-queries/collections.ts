import 'server-only';

import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { collections, collectionItems } from '../../db/schema/collections';
import { themes } from '../../db/schema/themes';
import { MAX_COLLECTION_ITEMS, MAX_USER_COLLECTIONS } from '../../lib/collections';
import type { UserCollectionDetail, UserCollectionSummary } from '../../lib/collections';
import { themeIdSchema } from '../../lib/theme-status';
import { getSession, requireUser } from '../guards';
import { hydrateThemeCards, themeCardColumns } from '../queries/shared';
import { cdnUrl } from '../storage/urls';

function columns(themeId?: string) {
  return {
    id: collections.id,
    titleEn: collections.titleEn,
    visibility: collections.visibility,
    itemCount: sql<number>`(SELECT count(*)::int FROM collection_items ci JOIN themes t ON t.id = ci.theme_id WHERE ci.collection_id = "collections"."id" AND t.status = 'published')`,
    coverThumbKey: sql<
      string | null
    >`(SELECT t.assets->>'thumb' FROM collection_items ci JOIN themes t ON t.id = ci.theme_id WHERE ci.collection_id = "collections"."id" AND t.status = 'published' ORDER BY ci.position, t.id LIMIT 1)`,
    containsTheme: themeId
      ? sql<boolean>`EXISTS(SELECT 1 FROM collection_items ci JOIN themes t ON t.id = ci.theme_id WHERE ci.collection_id = "collections"."id" AND ci.theme_id = ${themeId}::uuid AND t.status = 'published')`
      : sql<boolean>`false`,
  };
}
function summary(row: {
  id: string;
  titleEn: string;
  visibility: string;
  itemCount: number;
  coverThumbKey: string | null;
  containsTheme: boolean;
}): UserCollectionSummary {
  if (row.visibility !== 'private' && row.visibility !== 'unlisted')
    throw new Error('Invalid user collection visibility');
  return {
    id: row.id,
    titleEn: row.titleEn,
    visibility: row.visibility,
    itemCount: row.itemCount,
    coverThumbUrl: row.coverThumbKey ? cdnUrl(row.coverThumbKey) : null,
    containsTheme: row.containsTheme,
  };
}

export async function listMyCollections(themeId?: string): Promise<UserCollectionSummary[]> {
  const session = await requireUser();
  const id = themeId === undefined ? undefined : themeIdSchema.parse(themeId);
  const { db } = await import('../../db/index');
  const rows = await db
    .select(columns(id))
    .from(collections)
    .where(
      and(
        eq(collections.ownerId, session.user.id),
        eq(collections.kind, 'user'),
        inArray(collections.visibility, ['private', 'unlisted']),
      ),
    )
    .orderBy(desc(collections.updatedAt), desc(collections.id))
    .limit(MAX_USER_COLLECTIONS);
  return rows.map(summary);
}

export async function getUserCollection(id: string): Promise<UserCollectionDetail | null> {
  const validId = themeIdSchema.parse(id);
  const session = await getSession();
  const viewerId = session && !session.user.banned ? session.user.id : undefined;
  const permission = or(
    eq(collections.visibility, 'unlisted'),
    viewerId ? eq(collections.ownerId, viewerId) : undefined,
  );
  const allowed = and(
    eq(collections.id, validId),
    eq(collections.kind, 'user'),
    inArray(collections.visibility, ['private', 'unlisted']),
    permission,
  );
  const { db } = await import('../../db/index');
  const [row] = await db
    .select({ ...columns(), ownerId: collections.ownerId })
    .from(collections)
    .where(allowed)
    .limit(1);
  if (!row) return null;
  const items = await db
    .select(themeCardColumns)
    .from(collectionItems)
    .innerJoin(themes, eq(themes.id, collectionItems.themeId))
    .innerJoin(collections, eq(collections.id, collectionItems.collectionId))
    .where(and(allowed, eq(themes.status, 'published')))
    .orderBy(asc(collectionItems.position), asc(collectionItems.themeId))
    .limit(MAX_COLLECTION_ITEMS);
  return {
    ...summary(row),
    canEdit: viewerId === row.ownerId,
    items: await hydrateThemeCards(items, false),
  };
}
