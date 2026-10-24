import 'server-only';

import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { creatorProfiles } from '../../db/schema/moderation';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { themes } from '../../db/schema/themes';
import type { Paginated, ThemeCardDTO, ThemeListQuery } from '../../lib/dto';
import {
  decodeCursor,
  decodeOffsetCursor,
  encodeCursor,
  encodeOffsetCursor,
} from '../../lib/utils/cursor';
import { CacheTags, cacheTag } from '../cache';
import { toThemeCard, type ThemeCardSource, type TagRow, type CreatorMiniRow } from './mappers';

export const themeCardColumns = {
  id: themes.id,
  slug: themes.slug,
  nameEn: themes.nameEn,
  nameAr: themes.nameAr,
  assets: themes.assets,
  dominantColor: themes.dominantColor,
  isFeatured: themes.isFeatured,
  downloadCount: themes.downloadCount,
  favoriteCount: themes.favoriteCount,
  publishedAt: themes.publishedAt,
  ownerId: themes.ownerId,
};

export const newSortValue = sql`COALESCE(${themes.publishedAt}, ${themes.createdAt})`;
export const newSortText = sql<string>`to_char(${newSortValue} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** Resolve public card dependencies in two bounded queries, avoiding per-card reads. */
export async function hydrateThemeRows<T extends ThemeCardSource & { ownerId: string | null }>(
  rows: readonly T[],
): Promise<(T & { tags: TagRow[]; creator: CreatorMiniRow | null })[]> {
  if (!rows.length) return [];
  const { db } = await import('../../db/index');
  const ids = rows.map(({ id }) => id);
  const owners = [...new Set(rows.flatMap(({ ownerId }) => (ownerId ? [ownerId] : [])))];
  const [tagRows, profiles] = await Promise.all([
    db
      .select({
        themeId: themeTags.themeId,
        slug: tags.slug,
        kind: tags.kind,
        nameEn: tags.nameEn,
        nameAr: tags.nameAr,
      })
      .from(themeTags)
      .innerJoin(tags, eq(themeTags.tagId, tags.id))
      .where(and(inArray(themeTags.themeId, ids), eq(tags.isActive, true)))
      .orderBy(asc(tags.kind), asc(tags.sortOrder), asc(tags.slug)),
    owners.length
      ? db
          .select({
            userId: creatorProfiles.userId,
            handle: creatorProfiles.handle,
            displayName: creatorProfiles.displayName,
            avatarKey: creatorProfiles.avatarKey,
          })
          .from(creatorProfiles)
          .where(
            and(inArray(creatorProfiles.userId, owners), eq(creatorProfiles.status, 'approved')),
          )
      : Promise.resolve([]),
  ]);
  const byTheme = new Map<string, TagRow[]>();
  for (const tag of tagRows) {
    const existing = byTheme.get(tag.themeId) ?? [];
    existing.push(tag);
    byTheme.set(tag.themeId, existing);
  }
  const byOwner = new Map(profiles.map((profile) => [profile.userId, profile]));
  const dependencies = profiles.map(({ handle }) => CacheTags.creator(handle));
  if (dependencies.length) cacheTag(...dependencies);
  return rows.map((row) => ({
    ...row,
    tags: byTheme.get(row.id) ?? [],
    creator: row.ownerId ? (byOwner.get(row.ownerId) ?? null) : null,
  }));
}

export async function hydrateThemeCards(
  rows: readonly (ThemeCardSource & { ownerId: string | null })[],
): Promise<ThemeCardDTO[]> {
  return (await hydrateThemeRows(rows)).map(toThemeCard);
}

export async function readThemePage(
  query: ThemeListQuery,
  additionalPredicate?: SQL,
): Promise<Paginated<ThemeCardDTO>> {
  const { db } = await import('../../db/index');
  const predicates: (SQL | undefined)[] = [eq(themes.status, 'published'), additionalPredicate];
  if (query.ids) {
    if (!query.ids.length) return { items: [], nextCursor: null };
    const rows = await db
      .select(themeCardColumns)
      .from(themes)
      .where(and(...predicates, inArray(themes.id, query.ids)));
    const byId = new Map(rows.map((row) => [row.id, row]));
    return {
      items: await hydrateThemeCards(
        query.ids.flatMap((id) => {
          const row = byId.get(id);
          return row ? [row] : [];
        }),
      ),
      nextCursor: null,
    };
  }
  if (query.color) predicates.push(eq(themes.colorFamily, query.color));
  if (query.tags?.length) {
    const matching = db
      .select({ themeId: themeTags.themeId })
      .from(themeTags)
      .innerJoin(tags, eq(themeTags.tagId, tags.id))
      .where(and(eq(tags.isActive, true), inArray(tags.slug, query.tags)))
      .groupBy(themeTags.themeId)
      .having(sql`count(DISTINCT ${tags.slug}) = ${query.tags.length}`);
    predicates.push(inArray(themes.id, matching));
  }

  if (query.q) {
    const offset = query.cursor ? decodeOffsetCursor(query.cursor) : 0;
    if (offset >= 200) return { items: [], nextCursor: null };
    const textQuery = sql`websearch_to_tsquery('simple', ${query.q})`;
    const similarity = sql`greatest(similarity(${themes.nameEn}, ${query.q}), similarity(coalesce(${themes.nameAr}, ''), ${query.q}))`;
    predicates.push(sql`(${themes.searchVector} @@ ${textQuery} OR ${similarity} > 0.25)`);
    const rank = sql`ts_rank_cd(${themes.searchVector}, ${textQuery}) + ${similarity}`;
    const limit = Math.min(query.limit, 200 - offset);
    const rows = await db
      .select(themeCardColumns)
      .from(themes)
      .where(and(...predicates))
      .orderBy(desc(rank), desc(themes.id))
      .limit(Math.min(limit + 1, 200 - offset))
      .offset(offset);
    const selected = rows.slice(0, limit);
    return {
      items: await hydrateThemeCards(selected),
      nextCursor:
        rows.length > limit && offset + limit < 200 ? encodeOffsetCursor(offset + limit) : null,
    };
  }

  const column =
    query.sort === 'new'
      ? newSortValue
      : query.sort === 'popular'
        ? themes.downloadCount
        : themes.popularity;
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor, query.sort);
    predicates.push(
      cursor.k === 'new'
        ? sql`(${column}, ${themes.id}) < (${cursor.s}::timestamptz, ${cursor.id}::uuid)`
        : sql`(${column}, ${themes.id}) < (${cursor.s}, ${cursor.id}::uuid)`,
    );
  }
  const rows = await db
    .select({ ...themeCardColumns, sortTimestamp: newSortText, sortPopularity: themes.popularity })
    .from(themes)
    .where(and(...predicates))
    .orderBy(desc(column), desc(themes.id))
    .limit(query.limit + 1);
  const selected = rows.slice(0, query.limit);
  const last = selected.at(-1);
  const nextCursor =
    rows.length > query.limit && last
      ? encodeCursor(
          query.sort === 'new'
            ? { k: 'new', s: last.sortTimestamp, id: last.id }
            : {
                k: query.sort,
                s: query.sort === 'popular' ? last.downloadCount : last.sortPopularity,
                id: last.id,
              },
        )
      : null;
  return { items: await hydrateThemeCards(selected), nextCursor };
}
