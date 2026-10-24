import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { collections, collectionItems } from '../../db/schema/collections';
import { themes } from '../../db/schema/themes';
import { siteSettings } from '../../db/schema/system';
import { CacheTags } from '../../lib/cache-tags';
import { MAX_ADMIN_COLLECTION_ITEMS } from '../../lib/admin-content';
import { settingSchemas } from '../../lib/settings';
import type { Actor } from '../../lib/theme-status';
import {
  adminUpsertCollectionSchema,
  adminContentIdSchema,
  adminSetPinnedSchema,
  adminReorderCollectionSchema,
  adminCollectionItemSchema,
  type AdminUpsertCollectionInput,
} from '../../lib/validation/admin-content';
import type { AdminPrincipal, AdminTransaction } from './admin-access';
import { contentTransaction, logContent, parseContent } from './admin-content-common';
import { AppError } from '../errors';

const eligible = inArray(collections.kind, ['editorial', 'seasonal']);
async function locked(tx: AdminTransaction, id: string) {
  const [row] = await tx
    .select()
    .from(collections)
    .where(and(eq(collections.id, id), eligible))
    .for('update');
  if (!row) throw new AppError('NOT_FOUND');
  return row;
}
function cache(...slugs: (string | null | undefined)[]): string[] {
  return [
    ...new Set([
      CacheTags.collections,
      ...slugs.flatMap((slug) => (slug ? [CacheTags.collection(slug)] : [])),
    ]),
  ];
}
async function rewriteHero(
  tx: AdminTransaction,
  admin: AdminPrincipal,
  oldSlug: string | null,
  nextSlug: string | null,
): Promise<void> {
  if (!oldSlug || oldSlug === nextSlug) return;
  const [row] = await tx
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.key, 'home.hero'))
    .for('update');
  const parsed = settingSchemas['home.hero'].safeParse(row?.value);
  if (!parsed.success || parsed.data.collectionSlug !== oldSlug) return;
  const value = { collectionSlug: nextSlug };
  await tx
    .update(siteSettings)
    .set({ value, updatedBy: admin.userId })
    .where(eq(siteSettings.key, 'home.hero'));
  await logContent(tx, admin, 'settings.updated', 'setting', 'home.hero', {
    before: parsed.data,
    after: value,
    reason: 'collection.changed',
  });
}
async function normalize(tx: AdminTransaction, id: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await tx.execute(
    sql`UPDATE ${collectionItems} ci SET position=desired.position FROM (VALUES ${sql.join(
      ids.map((themeId, position) => sql`(${themeId}::uuid,${position}::int)`),
      sql`,`,
    )}) desired(theme_id,position) WHERE ci.collection_id=${id}::uuid AND ci.theme_id=desired.theme_id AND ci.position IS DISTINCT FROM desired.position`,
  );
}
async function members(tx: AdminTransaction, id: string) {
  return tx
    .select({ id: collectionItems.themeId, position: collectionItems.position })
    .from(collectionItems)
    .where(eq(collectionItems.collectionId, id))
    .orderBy(asc(collectionItems.position), asc(collectionItems.themeId))
    .for('update');
}
export async function adminUpsertCollection(
  input: AdminUpsertCollectionInput,
  actor: Actor,
): Promise<{ data: { id: string }; tags: string[] }> {
  const value = parseContent(adminUpsertCollectionSchema, input);
  return contentTransaction(actor, async (tx, admin) => {
    // Theme before collection: deleting a cover theme sets its FK to NULL.
    if (value.coverThemeId) {
      const [cover] = await tx
        .select({ id: themes.id })
        .from(themes)
        .where(and(eq(themes.id, value.coverThemeId), eq(themes.status, 'published')))
        .for('share');
      if (!cover)
        throw new AppError('VALIDATION', 'Cover must be published', { coverThemeId: ['invalid'] });
    }
    const before = value.id ? await locked(tx, value.id) : null;
    const { id: requested, ...fields } = value;
    const data = {
      ...fields,
      startsAt: value.startsAt ? new Date(value.startsAt) : null,
      endsAt: value.endsAt ? new Date(value.endsAt) : null,
    };
    let id = requested;
    const changed =
      !before ||
      Object.entries(data).some(([key, next]) => {
        const previous = Reflect.get(before, key) as unknown;
        return previous instanceof Date
          ? !(next instanceof Date) || previous.getTime() !== next.getTime()
          : previous !== next;
      });
    if (before) {
      if (changed) {
        await tx.update(collections).set(data).where(eq(collections.id, before.id));
        await logContent(tx, admin, 'collection.updated', 'collection', before.id, {
          before: { slug: before.slug, titleEn: before.titleEn, visibility: before.visibility },
          after: value,
        });
      }
      await rewriteHero(tx, admin, before.slug, value.slug);
    } else {
      const [created] = await tx.insert(collections).values(data).returning({ id: collections.id });
      if (!created) throw new AppError('INTERNAL');
      id = created.id;
      await logContent(tx, admin, 'collection.created', 'collection', id, { after: value });
    }
    if (!id) throw new AppError('INTERNAL');
    return { data: { id }, tags: [...cache(before?.slug, value.slug), CacheTags.settings] };
  });
}
export async function adminDeleteCollection(
  input: { id: string },
  actor: Actor,
): Promise<{ data: { id: string }; tags: string[] }> {
  const value = parseContent(adminContentIdSchema, input);
  return contentTransaction(actor, async (tx, admin) => {
    const row = await locked(tx, value.id);
    await rewriteHero(tx, admin, row.slug, null);
    await tx.delete(collections).where(eq(collections.id, row.id));
    await logContent(tx, admin, 'collection.deleted', 'collection', row.id, { slug: row.slug });
    return { data: { id: row.id }, tags: [...cache(row.slug), CacheTags.settings] };
  });
}
export async function adminSetPinned(
  input: { id: string; pinned: boolean },
  actor: Actor,
): Promise<{ data: { id: string }; tags: string[] }> {
  const value = parseContent(adminSetPinnedSchema, input);
  return contentTransaction(actor, async (tx, admin) => {
    const row = await locked(tx, value.id);
    if (row.isPinned !== value.pinned) {
      await tx
        .update(collections)
        .set({ isPinned: value.pinned })
        .where(eq(collections.id, row.id));
      await logContent(tx, admin, 'collection.updated', 'collection', row.id, {
        before: { isPinned: row.isPinned },
        after: { isPinned: value.pinned },
      });
    }
    return { data: { id: row.id }, tags: cache(row.slug) };
  });
}
export async function adminReorderCollection(
  input: { collectionId: string; themeIds: string[] },
  actor: Actor,
): Promise<{ data: { ok: true }; tags: string[] }> {
  const value = parseContent(adminReorderCollectionSchema, input);
  return contentTransaction(actor, async (tx, admin) => {
    const row = await locked(tx, value.collectionId),
      before = await members(tx, row.id);
    if (
      before.length > MAX_ADMIN_COLLECTION_ITEMS ||
      before.length !== value.themeIds.length ||
      before.some((item) => !value.themeIds.includes(item.id))
    )
      throw new AppError('CONFLICT');
    if (
      before.some((item, index) => item.id !== value.themeIds[index] || item.position !== index)
    ) {
      await normalize(tx, row.id, value.themeIds);
      await tx.update(collections).set({ updatedAt: new Date() }).where(eq(collections.id, row.id));
      await logContent(tx, admin, 'collection.reordered', 'collection', row.id, {
        themeIds: value.themeIds,
      });
    }
    return { data: { ok: true }, tags: cache(row.slug) };
  });
}
export async function adminRemoveCollectionItem(
  input: { collectionId: string; themeId: string },
  actor: Actor,
): Promise<{ data: { itemCount: number }; tags: string[] }> {
  const value = parseContent(adminCollectionItemSchema, input);
  return contentTransaction(actor, async (tx, admin) => {
    const row = await locked(tx, value.collectionId),
      before = await members(tx, row.id),
      remaining = before.filter((item) => item.id !== value.themeId);
    if (remaining.length !== before.length) {
      await tx
        .delete(collectionItems)
        .where(
          and(eq(collectionItems.collectionId, row.id), eq(collectionItems.themeId, value.themeId)),
        );
      await normalize(
        tx,
        row.id,
        remaining.map((item) => item.id),
      );
      await tx.update(collections).set({ updatedAt: new Date() }).where(eq(collections.id, row.id));
      await logContent(tx, admin, 'collection.updated', 'collection', row.id, {
        operation: 'remove',
        themeId: value.themeId,
      });
    }
    return { data: { itemCount: remaining.length }, tags: cache(row.slug) };
  });
}
