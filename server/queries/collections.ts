import 'server-only';

import { and, asc, eq, inArray, isNull, lte, gt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { collections, collectionItems } from '../../db/schema/collections';
import { themes } from '../../db/schema/themes';
import type { CollectionCardDTO, CollectionDetailDTO } from '../../lib/dto';
import type { HomeCollectionCandidate } from '../../lib/collection-window';
import { decodeCollectionCursor, encodeCollectionCursor } from '../../lib/utils/cursor';
import { CacheTags, cacheLife, cacheTag } from '../cache';
import { toCollectionCard } from './mappers';
import { hydrateThemeCards, themeCardColumns } from './shared';

const columns = {
  id: collections.id,
  slug: collections.slug,
  kind: collections.kind,
  titleEn: collections.titleEn,
  titleAr: collections.titleAr,
  itemCount: sql<number>`(SELECT count(*)::int FROM collection_items ci JOIN themes t ON t.id = ci.theme_id WHERE ci.collection_id = "collections"."id" AND t.status = 'published')`,
  coverThumbKey: sql<
    string | null
  >`COALESCE((SELECT t.assets->>'thumb' FROM themes t WHERE t.id = "collections"."cover_theme_id" AND t.status = 'published'), (SELECT t.assets->>'thumb' FROM collection_items ci JOIN themes t ON t.id = ci.theme_id WHERE ci.collection_id = "collections"."id" AND t.status = 'published' ORDER BY ci.position ASC, t.id ASC LIMIT 1))`,
};
const publicCollection = and(
  eq(collections.visibility, 'public'),
  inArray(collections.kind, ['editorial', 'seasonal']),
);

function activeSeason(now: Date): SQL | undefined {
  return and(
    eq(collections.kind, 'seasonal'),
    or(isNull(collections.startsAt), lte(collections.startsAt, now)),
    or(isNull(collections.endsAt), gt(collections.endsAt, now)),
  );
}

/** Cache public content, then evaluate the schedule at request time in the Home server leaf. */
export async function getHomeCollectionCandidates(): Promise<HomeCollectionCandidate[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(CacheTags.collections, CacheTags.themes);
  const { db } = await import('../../db/index');
  const rows = await db
    .select({
      ...columns,
      descriptionEn: collections.descriptionEn,
      descriptionAr: collections.descriptionAr,
      isPinned: collections.isPinned,
      startsAt: collections.startsAt,
      endsAt: collections.endsAt,
    })
    .from(collections)
    .where(publicCollection)
    .orderBy(asc(collections.sortOrder), asc(collections.id));
  return rows.map((row) => ({
    ...toCollectionCard(row),
    descriptionEn: row.descriptionEn,
    descriptionAr: row.descriptionAr,
    isPinned: row.isPinned,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
  }));
}

export async function listPublicCollections(): Promise<CollectionCardDTO[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(CacheTags.collections, CacheTags.themes);
  const now = new Date();
  const { db } = await import('../../db/index');
  const rows = await db
    .select(columns)
    .from(collections)
    .where(and(publicCollection, or(eq(collections.kind, 'editorial'), activeSeason(now))))
    .orderBy(asc(collections.sortOrder), asc(collections.id));
  return rows.map(toCollectionCard);
}

export async function getHomeCollections(): Promise<CollectionCardDTO[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(CacheTags.collections, CacheTags.themes);
  const now = new Date();
  const { db } = await import('../../db/index');
  const rows = await db
    .select(columns)
    .from(collections)
    .where(
      and(
        publicCollection,
        or(
          and(eq(collections.kind, 'editorial'), eq(collections.isPinned, true)),
          activeSeason(now),
        ),
      ),
    )
    .orderBy(asc(collections.sortOrder), asc(collections.id));
  return rows.map(toCollectionCard);
}

export async function getCollection(
  slug: string,
  cursor?: string | null,
): Promise<CollectionDetailDTO | null> {
  'use cache';
  cacheLife('hours');
  const validSlug = z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,159}$/)
    .parse(slug);
  const pagination = cursor ? decodeCollectionCursor(cursor) : null;
  cacheTag(
    CacheTags.collections,
    CacheTags.collection(validSlug),
    CacheTags.themes,
    CacheTags.taxonomy,
  );
  const { db } = await import('../../db/index');
  const [collection] = await db
    .select({
      ...columns,
      descriptionEn: collections.descriptionEn,
      descriptionAr: collections.descriptionAr,
    })
    .from(collections)
    .where(and(publicCollection, eq(collections.slug, validSlug)))
    .limit(1);
  if (!collection) return null;
  const rows = await db
    .select({ ...themeCardColumns, position: collectionItems.position })
    .from(collectionItems)
    .innerJoin(themes, eq(collectionItems.themeId, themes.id))
    .where(
      and(
        eq(collectionItems.collectionId, collection.id),
        eq(themes.status, 'published'),
        pagination
          ? sql`(${collectionItems.position}, ${themes.id}) > (${pagination.s}, ${pagination.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(asc(collectionItems.position), asc(themes.id))
    .limit(25);
  const selected = rows.slice(0, 24);
  const last = selected.at(-1);
  return {
    ...toCollectionCard(collection),
    descriptionEn: collection.descriptionEn,
    descriptionAr: collection.descriptionAr,
    items: {
      items: await hydrateThemeCards(selected),
      nextCursor:
        rows.length > 24 && last ? encodeCollectionCursor({ s: last.position, id: last.id }) : null,
    },
  };
}
