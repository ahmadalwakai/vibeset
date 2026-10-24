import 'server-only';
import { and, asc, count, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { collections, collectionItems } from '../../db/schema/collections';
import { tags } from '../../db/schema/taxonomy';
import { apps } from '../../db/schema/catalog';
import { themes } from '../../db/schema/themes';
import { getTaxonomyTag } from '../../content/taxonomy';
import type { AdminPage } from '../../lib/admin';
import type {
  AdminCollection,
  AdminCollectionDetail,
  AdminCollectionPage,
  AdminContentTag,
  AdminAppPage,
  AdminThemeChoice,
} from '../../lib/admin-content';
import { themeIdSchema } from '../../lib/theme-status';
import {
  adminAppListSchema,
  adminCollectionListSchema,
  adminPublishedPickerSchema,
  adminTagListSchema,
} from '../../lib/validation/admin-content';
import { adminQueryInput } from '../../lib/validation/admin-queries';
import { requireAdmin } from '../guards';
import { cdnUrl } from '../storage/urls';
import { offsetPage } from './admin-shared';

const editorial = inArray(collections.kind, ['editorial', 'seasonal']);
const collectionColumns = {
  id: collections.id,
  slug: collections.slug,
  kind: collections.kind,
  visibility: collections.visibility,
  titleEn: collections.titleEn,
  titleAr: collections.titleAr,
  descriptionEn: collections.descriptionEn,
  descriptionAr: collections.descriptionAr,
  coverThemeId: collections.coverThemeId,
  isPinned: collections.isPinned,
  sortOrder: collections.sortOrder,
  startsAt: collections.startsAt,
  endsAt: collections.endsAt,
  updatedAt: collections.updatedAt,
  itemCount: sql<number>`(SELECT count(*)::int FROM collection_items ci WHERE ci.collection_id="collections"."id")`,
  publishedCount: sql<number>`(SELECT count(*)::int FROM collection_items ci JOIN themes t ON t.id=ci.theme_id WHERE ci.collection_id="collections"."id" AND t.status='published')`,
  coverKey: sql<
    string | null
  >`coalesce((SELECT t.assets->>'thumb' FROM themes t WHERE t.id="collections"."cover_theme_id" AND t.status='published'),(SELECT t.assets->>'thumb' FROM collection_items ci JOIN themes t ON t.id=ci.theme_id WHERE ci.collection_id="collections"."id" AND t.status='published' ORDER BY ci.position,t.id LIMIT 1))`,
};
function collection(row: {
  [K in keyof typeof collectionColumns]: K extends 'itemCount' | 'publishedCount'
    ? number
    : K extends 'coverKey'
      ? string | null
      : K extends keyof typeof collections.$inferSelect
        ? (typeof collections.$inferSelect)[K]
        : never;
}): AdminCollection {
  if (
    !row.slug ||
    (row.kind !== 'editorial' && row.kind !== 'seasonal') ||
    (row.visibility !== 'public' && row.visibility !== 'private')
  )
    throw new Error('Invalid editorial collection');
  const { coverKey, ...fields } = row;
  return {
    ...fields,
    slug: row.slug,
    kind: row.kind,
    visibility: row.visibility,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    coverThumbUrl: coverKey ? cdnUrl(coverKey) : null,
  };
}
export async function listAdminCollections(input: unknown = {}): Promise<AdminCollectionPage> {
  await requireAdmin();
  const value = adminCollectionListSchema.parse(adminQueryInput(input));
  const where = and(
    editorial,
    value.kind ? eq(collections.kind, value.kind) : undefined,
    value.q
      ? or(
          ilike(collections.titleEn, `%${value.q}%`),
          ilike(collections.titleAr, `%${value.q}%`),
          ilike(collections.slug, `%${value.q}%`),
        )
      : undefined,
  );
  const { db } = await import('../../db');
  const [rows, total] = await Promise.all([
    db
      .select(collectionColumns)
      .from(collections)
      .where(where)
      .orderBy(asc(collections.sortOrder), asc(collections.id))
      .limit(50)
      .offset((value.page - 1) * 50),
    db.select({ total: count() }).from(collections).where(where),
  ]);
  return offsetPage(rows.map(collection), total[0]?.total ?? 0, value.page, 50);
}
export async function getAdminCollection(id: string): Promise<AdminCollectionDetail | null> {
  await requireAdmin();
  const validId = themeIdSchema.parse(id);
  const { db } = await import('../../db');
  const [row] = await db
    .select(collectionColumns)
    .from(collections)
    .where(and(eq(collections.id, validId), editorial));
  if (!row) return null;
  const items = await db
    .select({
      id: themes.id,
      slug: themes.slug,
      nameEn: themes.nameEn,
      nameAr: themes.nameAr,
      status: themes.status,
      assets: themes.assets,
      position: collectionItems.position,
    })
    .from(collectionItems)
    .innerJoin(themes, eq(themes.id, collectionItems.themeId))
    .where(eq(collectionItems.collectionId, validId))
    .orderBy(asc(collectionItems.position), asc(themes.id));
  return {
    ...collection(row),
    items: items.map(({ assets, ...item }) => ({
      ...item,
      thumbUrl: assets?.thumb ? cdnUrl(assets.thumb) : null,
    })),
  };
}
export async function listAdminTags(input: unknown = {}): Promise<AdminContentTag[]> {
  await requireAdmin();
  const value = adminTagListSchema.parse(input);
  const { db } = await import('../../db');
  const rows = await db
    .select({
      id: tags.id,
      slug: tags.slug,
      kind: tags.kind,
      nameEn: tags.nameEn,
      nameAr: tags.nameAr,
      descriptionEn: tags.descriptionEn,
      descriptionAr: tags.descriptionAr,
      sortOrder: tags.sortOrder,
      isActive: tags.isActive,
      usageCount: sql<number>`(SELECT count(*)::int FROM theme_tags tt WHERE tt.tag_id="tags"."id")`,
    })
    .from(tags)
    .where(value.kind ? eq(tags.kind, value.kind) : undefined)
    .orderBy(asc(tags.kind), asc(tags.sortOrder), asc(tags.slug))
    .limit(5000);
  return rows.map((row) => ({ ...row, isSeeded: !!getTaxonomyTag(row.slug) }));
}
export async function listAdminApps(input: unknown = {}): Promise<AdminAppPage> {
  await requireAdmin();
  const value = adminAppListSchema.parse(adminQueryInput(input));
  const { db } = await import('../../db');
  const where = value.q
    ? or(
        ilike(apps.name, `%${value.q}%`),
        ilike(apps.slug, `%${value.q}%`),
        sql`array_to_string(${apps.aliases},' ') ILIKE ${`%${value.q}%`}`,
      )
    : undefined;
  const [rows, total] = await Promise.all([
    db
      .select({
        id: apps.id,
        slug: apps.slug,
        name: apps.name,
        aliases: apps.aliases,
        category: apps.category,
        glyph: apps.glyph,
        iosScheme: apps.iosScheme,
        androidPackage: apps.androidPackage,
        rank: apps.rank,
        isActive: apps.isActive,
      })
      .from(apps)
      .where(where)
      .orderBy(asc(apps.rank), asc(apps.slug))
      .limit(50)
      .offset((value.page - 1) * 50),
    db.select({ total: count() }).from(apps).where(where),
  ]);
  return offsetPage(rows, total[0]?.total ?? 0, value.page, 50);
}
export async function listAdminAppOrder(): Promise<{ id: string; slug: string; rank: number }[]> {
  await requireAdmin();
  const { db } = await import('../../db');
  return db
    .select({ id: apps.id, slug: apps.slug, rank: apps.rank })
    .from(apps)
    .where(eq(apps.isActive, true))
    .orderBy(asc(apps.rank), asc(apps.slug))
    .limit(5000);
}
export async function searchAdminPublishedThemes(
  input: unknown = {},
): Promise<AdminPage<AdminThemeChoice>> {
  await requireAdmin();
  const value = adminPublishedPickerSchema.parse(input);
  const { db } = await import('../../db');
  const where = and(
    eq(themes.status, 'published'),
    value.q
      ? or(
          ilike(themes.nameEn, `%${value.q}%`),
          ilike(themes.nameAr, `%${value.q}%`),
          ilike(themes.slug, `%${value.q}%`),
        )
      : undefined,
  );
  const [rows, total] = await Promise.all([
    db
      .select({
        id: themes.id,
        slug: themes.slug,
        nameEn: themes.nameEn,
        nameAr: themes.nameAr,
        assets: themes.assets,
      })
      .from(themes)
      .where(where)
      .orderBy(asc(themes.nameEn), asc(themes.id))
      .limit(24)
      .offset((value.page - 1) * 24),
    db.select({ total: count() }).from(themes).where(where),
  ]);
  return offsetPage(
    rows.map(({ assets, ...row }) => ({
      ...row,
      thumbUrl: assets?.thumb ? cdnUrl(assets.thumb) : null,
    })),
    total[0]?.total ?? 0,
    value.page,
    24,
  );
}
