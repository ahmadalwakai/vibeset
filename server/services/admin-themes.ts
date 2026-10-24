import 'server-only';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { dbPool } from '../../db/pool';
import { user } from '../../db/schema/auth';
import { themes } from '../../db/schema/themes';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { collections, collectionItems } from '../../db/schema/collections';
import { uploads } from '../../db/schema/system';
import type {
  AdminThemeBulkData,
  AdminThemeCleanup,
  AdminThemeUpdateData,
} from '../../lib/admin-themes';
import { CacheTags } from '../../lib/cache-tags';
import { specHash } from '../../lib/render/hash';
import { themeSpecSchema, type ThemeSpec } from '../../lib/render/spec';
import { actorSchema, themeIdSchema, type Actor } from '../../lib/theme-status';
import {
  adminAddToCollectionSchema,
  adminDeleteThemesSchema,
  adminSetFeaturedSchema,
  adminTagThemesSchema,
  adminTransitionThemesSchema,
  adminUpdateThemeSchema,
} from '../../lib/validation/admin-themes';
import type {
  AdminAddToCollectionInput,
  AdminDeleteThemesInput,
  AdminSetFeaturedInput,
  AdminTagThemesInput,
  AdminTransitionThemesInput,
  AdminUpdateThemeInput,
} from '../../lib/validation/admin-themes';
import { auditInsert } from '../audit';
import { createAdminReviewVersion } from '../admin-review-version';
import { AppError } from '../errors';
import { incomingUploadKey, themePrefix, wallpaperUploadKeys } from '../storage/keys';
import { defaultStorage, type ObjectStorage } from '../storage/r2';
import { getThemeCacheTags, transitionStatements } from './theme-status';

type Transaction = Parameters<Parameters<typeof dbPool.transaction>[0]>[0];
type Theme = typeof themes.$inferSelect;
type AdminActor = Extract<Actor, { kind: 'user' }>;
interface Mutation<T> {
  data: T;
  tags: string[];
  cleanup?: AdminThemeCleanup;
}
interface Item {
  tags: string[];
  cleanup?: boolean;
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError('VALIDATION');
  return result.data;
}
function identity(actor: Actor): AdminActor {
  const value = parse(actorSchema, actor);
  if (value.kind !== 'user') throw new AppError('FORBIDDEN');
  return value;
}
async function principal(tx: Transaction, actor: AdminActor): Promise<AdminActor> {
  const [row] = await tx
    .select({ id: user.id, role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, actor.userId))
    .for('share');
  if (!row) throw new AppError('UNAUTHENTICATED');
  if (row.banned || row.role !== 'admin') throw new AppError('FORBIDDEN');
  return { kind: 'user', userId: row.id, role: 'admin', isCreator: false };
}
async function lockedTheme(tx: Transaction, id: string, adminId: string): Promise<Theme> {
  const [snapshot] = await tx
    .select({ ownerId: themes.ownerId })
    .from(themes)
    .where(eq(themes.id, id));
  if (!snapshot) throw new AppError('NOT_FOUND');
  // Match creator authoring's account-before-theme lock order. Deletion must
  // capture the final spec/status, including an administrator's changes.
  if (snapshot.ownerId && snapshot.ownerId !== adminId)
    await tx.select({ id: user.id }).from(user).where(eq(user.id, snapshot.ownerId)).for('share');
  const [row] = await tx.select().from(themes).where(eq(themes.id, id)).for('update');
  if (!row) throw new AppError('NOT_FOUND');
  if (row.ownerId !== null && row.ownerId !== snapshot.ownerId) throw new AppError('CONFLICT');
  return row;
}
async function authorTags(tx: Transaction, slugs: string[]) {
  if (slugs.length < 1 || slugs.length > 100) throw new AppError('VALIDATION', 'Invalid tags');
  const rows = await tx
    .select({
      id: tags.id,
      slug: tags.slug,
      kind: tags.kind,
      nameEn: tags.nameEn,
      nameAr: tags.nameAr,
    })
    .from(tags)
    .where(and(inArray(tags.slug, slugs), eq(tags.isActive, true)))
    .for('share');
  if (rows.length !== slugs.length || rows.filter((row) => row.kind === 'aesthetic').length !== 1)
    throw new AppError('VALIDATION', 'Exactly one active aesthetic and active tags are required', {
      tagSlugs: ['invalid'],
    });
  return rows.sort((a, b) => a.slug.localeCompare(b.slug));
}
async function memberships(tx: Transaction, id: string) {
  return tx
    .select({ id: tags.id, slug: tags.slug })
    .from(themeTags)
    .innerJoin(tags, eq(themeTags.tagId, tags.id))
    .where(eq(themeTags.themeId, id))
    .orderBy(asc(tags.slug));
}
async function replaceTags(
  tx: Transaction,
  id: string,
  selected: readonly { id: string }[],
): Promise<void> {
  await tx.delete(themeTags).where(eq(themeTags.themeId, id));
  await tx.insert(themeTags).values(selected.map((tag) => ({ themeId: id, tagId: tag.id })));
}
function photoKeys(spec: ThemeSpec): string[] {
  return [
    ...new Set(
      [spec.wallpaper, spec.lockWallpaper].flatMap((wallpaper) =>
        wallpaper?.kind === 'image' ? [wallpaper.assetKey] : [],
      ),
    ),
  ];
}
async function photos(
  tx: Transaction,
  row: Theme,
  spec: ThemeSpec,
  adminId: string,
): Promise<void> {
  const previous = new Set(photoKeys(parse(themeSpecSchema, row.spec))),
    keys = photoKeys(spec);
  for (const key of keys) {
    const id = themeIdSchema.safeParse(key.split('/')[2]);
    if (!id.success || wallpaperUploadKeys(id.data).full !== key)
      throw new AppError('FORBIDDEN', 'Only canonical wallpaper photos are permitted');
  }
  const introduced = keys.filter((key) => !previous.has(key));
  if (!introduced.length) return;
  const rows = await tx
    .select({
      id: uploads.id,
      ownerId: uploads.ownerId,
      incomingKey: uploads.incomingKey,
      fullKey: uploads.fullKey,
    })
    .from(uploads)
    .where(
      and(
        inArray(uploads.fullKey, introduced),
        eq(uploads.status, 'ready'),
        inArray(uploads.ownerId, [...new Set([adminId, ...(row.ownerId ? [row.ownerId] : [])])]),
      ),
    )
    .for('share');
  const allowed = new Set(
    rows
      .filter(
        (upload) =>
          upload.fullKey === wallpaperUploadKeys(upload.id).full &&
          upload.incomingKey === incomingUploadKey(upload.ownerId, upload.id),
      )
      .map((upload) => upload.fullKey),
  );
  if (introduced.some((key) => !allowed.has(key)))
    throw new AppError(
      'FORBIDDEN',
      'New photos must be ready uploads owned by the theme owner or admin',
    );
}
async function publishedTags(row: Theme): Promise<string[]> {
  return row.status === 'published' ? getThemeCacheTags(row) : [];
}
function stale(row: Theme, hash = row.specHash): boolean {
  return row.assetVersion > 0 && row.assetsSpecHash !== hash;
}
async function log(
  tx: Transaction,
  actor: AdminActor,
  row: Theme,
  action: string,
  meta: Record<string, unknown>,
): Promise<void> {
  await tx.execute(
    auditInsert({ actorId: actor.userId, action, entityType: 'theme', entityId: row.id, meta }),
  );
}

export async function adminUpdateTheme(
  input: AdminUpdateThemeInput,
  actor: Actor,
): Promise<Mutation<AdminThemeUpdateData>> {
  const value = parse(adminUpdateThemeSchema, input),
    who = identity(actor);
  return dbPool.transaction(async (tx) => {
    const admin = await principal(tx, who),
      row = await lockedTheme(tx, value.id, admin.userId),
      spec = value.spec ?? parse(themeSpecSchema, row.spec),
      hash = await specHash(spec);
    await photos(tx, row, spec, admin.userId);
    const selected = await authorTags(tx, value.tagSlugs),
      existing = await memberships(tx, row.id),
      tagsSame =
        selected.length === existing.length &&
        selected.every((tag) => existing.some((old) => old.id === tag.id));
    const data = {
      nameEn: value.nameEn,
      nameAr: value.nameAr || null,
      descriptionEn: value.descriptionEn || null,
      descriptionAr: value.descriptionAr || null,
      isFeatured: value.isFeatured,
      spec,
      specHash: hash,
      tagsText: selected.map((tag) => `${tag.slug} ${tag.nameEn} ${tag.nameAr}`).join(' '),
    };
    const invalidation = await publishedTags(row);
    const changed =
      !tagsSame ||
      row.nameEn !== data.nameEn ||
      row.nameAr !== data.nameAr ||
      row.descriptionEn !== data.descriptionEn ||
      row.descriptionAr !== data.descriptionAr ||
      row.isFeatured !== data.isFeatured ||
      row.specHash !== hash ||
      row.tagsText !== data.tagsText;
    if (changed) {
      const updated = await tx
        .update(themes)
        .set(data)
        .where(
          and(
            eq(themes.id, row.id),
            eq(themes.assetVersion, row.assetVersion),
            eq(themes.specHash, row.specHash),
          ),
        )
        .returning({ id: themes.id });
      if (!updated.length) throw new AppError('CONFLICT');
      if (!tagsSame) await replaceTags(tx, row.id, selected);
      await log(tx, admin, row, 'theme.updated', {
        before: {
          nameEn: row.nameEn,
          nameAr: row.nameAr,
          specHash: row.specHash,
          isFeatured: row.isFeatured,
        },
        after: {
          nameEn: data.nameEn,
          nameAr: data.nameAr,
          specHash: hash,
          isFeatured: data.isFeatured,
        },
        tagSlugs: selected.map((tag) => tag.slug),
      });
    }
    return { data: { id: row.id, stale: stale(row, hash) }, tags: invalidation };
  });
}

async function bulk(
  ids: string[],
  actor: Actor,
  operation: (tx: Transaction, id: string, admin: AdminActor) => Promise<Item>,
): Promise<Mutation<AdminThemeBulkData>> {
  const who = identity(actor);
  await dbPool.transaction((tx) => principal(tx, who));
  const data: AdminThemeBulkData = { count: 0, results: [] },
    invalidation = new Set<string>(),
    cleanup: string[] = [];
  for (const id of ids) {
    try {
      const result = await dbPool.transaction(async (tx) =>
        operation(tx, id, await principal(tx, who)),
      );
      data.count += 1;
      data.results.push({ id, ok: true });
      for (const tag of result.tags) invalidation.add(tag);
      if (result.cleanup) cleanup.push(id);
    } catch (error) {
      if (!(error instanceof AppError))
        console.error({ scope: 'admin.theme.mutation', id, failed: true });
      data.results.push({
        id,
        ok: false,
        code: error instanceof AppError ? error.code : 'INTERNAL',
      });
    }
  }
  return {
    data,
    tags: [...invalidation],
    ...(cleanup.length ? { cleanup: { themeIds: cleanup } } : {}),
  };
}
export async function adminTransitionThemes(
  input: AdminTransitionThemesInput,
  actor: Actor,
): Promise<Mutation<AdminThemeBulkData>> {
  const value = parse(adminTransitionThemesSchema, input);
  return bulk(value.ids, actor, async (tx, id, admin) => {
    const row = await lockedTheme(tx, id, admin.userId);
    if (value.reviewVersion !== undefined) {
      const [revision] = await tx
        .select({
          revisionTime: sql<string>`to_char((CASE WHEN ${themes.status}='pending_review'
            THEN coalesce(${themes.submittedAt},${themes.createdAt}) ELSE ${themes.updatedAt} END)
            AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        })
        .from(themes)
        .where(eq(themes.id, id));
      if (
        !revision ||
        createAdminReviewVersion({
          status: row.status,
          specHash: row.specHash,
          revisionTime: revision.revisionTime,
        }) !== value.reviewVersion
      )
        throw new AppError('CONFLICT');
    }
    const invalidation =
      row.status === 'published' || row.status === 'archived' ? await getThemeCacheTags(row) : [];
    if (row.status === value.to) return { tags: invalidation };
    const [statement] = transitionStatements(row, value.to, admin, value.reason),
      changed = await tx.execute(statement);
    if (changed.rows.length !== 1) throw new AppError('CONFLICT');
    return { tags: invalidation };
  });
}
export async function adminSetFeatured(
  input: AdminSetFeaturedInput,
  actor: Actor,
): Promise<Mutation<AdminThemeBulkData>> {
  const value = parse(adminSetFeaturedSchema, input);
  return bulk(value.ids, actor, async (tx, id, admin) => {
    const row = await lockedTheme(tx, id, admin.userId),
      invalidation = await publishedTags(row);
    if (row.isFeatured !== value.featured) {
      await tx.update(themes).set({ isFeatured: value.featured }).where(eq(themes.id, id));
      await log(tx, admin, row, 'theme.featured', {
        before: row.isFeatured,
        after: value.featured,
      });
    }
    return { tags: invalidation };
  });
}
export async function adminTagThemes(
  input: AdminTagThemesInput,
  actor: Actor,
): Promise<Mutation<AdminThemeBulkData>> {
  const value = parse(adminTagThemesSchema, input);
  return bulk(value.ids, actor, async (tx, id, admin) => {
    const row = await lockedTheme(tx, id, admin.userId),
      existing = await memberships(tx, id),
      final = [
        ...new Set([
          ...existing.map((tag) => tag.slug).filter((slug) => !value.remove.includes(slug)),
          ...value.add,
        ]),
      ],
      selected = await authorTags(tx, final),
      invalidation = await publishedTags(row);
    const tagsText = selected.map((tag) => `${tag.slug} ${tag.nameEn} ${tag.nameAr}`).join(' ');
    if (
      selected.length !== existing.length ||
      selected.some((tag) => !existing.some((old) => old.id === tag.id)) ||
      row.tagsText !== tagsText
    ) {
      await replaceTags(tx, id, selected);
      await tx.update(themes).set({ tagsText }).where(eq(themes.id, id));
      await log(tx, admin, row, 'theme.tagged', {
        before: existing.map((tag) => tag.slug),
        after: selected.map((tag) => tag.slug),
      });
    }
    return { tags: invalidation };
  });
}
export async function adminAddToCollection(
  input: AdminAddToCollectionInput,
  actor: Actor,
): Promise<Mutation<AdminThemeBulkData>> {
  const value = parse(adminAddToCollectionSchema, input);
  return bulk(value.ids, actor, async (tx, id, admin) => {
    const [collection] = await tx
      .select()
      .from(collections)
      .where(eq(collections.id, value.collectionId))
      .for('update');
    if (!collection) throw new AppError('NOT_FOUND');
    if (collection.kind === 'user') throw new AppError('FORBIDDEN');
    const [row] = await tx.select().from(themes).where(eq(themes.id, id)).for('share');
    if (!row) throw new AppError('NOT_FOUND');
    if (row.status !== 'published') throw new AppError('INVALID_STATE');
    const invalidation = [
      CacheTags.collections,
      ...(collection.slug ? [CacheTags.collection(collection.slug)] : []),
    ];
    const [existing] = await tx
      .select({ id: collectionItems.themeId })
      .from(collectionItems)
      .where(and(eq(collectionItems.collectionId, collection.id), eq(collectionItems.themeId, id)));
    if (existing) return { tags: invalidation };
    const [position] = await tx
      .select({ next: sql<number>`coalesce(max(${collectionItems.position}),-1)::int+1` })
      .from(collectionItems)
      .where(eq(collectionItems.collectionId, collection.id));
    await tx
      .insert(collectionItems)
      .values({ collectionId: collection.id, themeId: id, position: position?.next ?? 0 });
    await tx
      .update(collections)
      .set({ updatedAt: new Date() })
      .where(eq(collections.id, collection.id));
    await tx.execute(
      auditInsert({
        actorId: admin.userId,
        action: 'collection.updated',
        entityType: 'collection',
        entityId: collection.id,
        meta: { operation: 'add', themeId: id },
      }),
    );
    return { tags: invalidation };
  });
}
export async function adminDeleteThemes(
  input: AdminDeleteThemesInput,
  actor: Actor,
): Promise<Mutation<AdminThemeBulkData>> {
  const value = parse(adminDeleteThemesSchema, input);
  return bulk(value.ids, actor, async (tx, id, admin) => {
    const row = await lockedTheme(tx, id, admin.userId);
    if (row.status === 'published') throw new AppError('INVALID_STATE');
    const invalidation = await getThemeCacheTags(row);
    await tx
      .delete(themes)
      .where(and(eq(themes.id, id), eq(themes.assetVersion, row.assetVersion)));
    await log(tx, admin, row, 'theme.deleted', {
      source: row.source,
      status: row.status,
      assetVersion: row.assetVersion,
    });
    return { tags: invalidation, cleanup: true };
  });
}

/** Called after confirmed deletions; originals in uploads/ and avatars/ are never touched. */
export async function cleanupDeletedThemeAssets(
  ids: readonly string[],
  storage: ObjectStorage = defaultStorage,
): Promise<void> {
  const values = [...new Set(ids.map((id) => themeIdSchema.parse(id)))];
  if (!values.length) return;
  const { db } = await import('../../db');
  const existing = new Set(
    (await db.select({ id: themes.id }).from(themes).where(inArray(themes.id, values))).map(
      (row) => row.id,
    ),
  );
  const results = await Promise.allSettled(
    values.filter((id) => !existing.has(id)).map((id) => storage.deletePrefix(themePrefix(id))),
  );
  if (results.some((result) => result.status === 'rejected'))
    console.error({ scope: 'admin.theme.cleanup', failed: true });
}
