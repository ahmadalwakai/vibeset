import 'server-only';

import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { dbPool } from '../../db/pool';
import { user } from '../../db/schema/auth';
import { collectionItems, collections } from '../../db/schema/collections';
import { favorites } from '../../db/schema/engagement';
import { creatorProfiles } from '../../db/schema/moderation';
import { uploads } from '../../db/schema/system';
import { themes } from '../../db/schema/themes';
import type { AccountCleanupPlan } from '../../lib/account';
import { CacheTags } from '../../lib/cache-tags';
import { themeSpecSchema } from '../../lib/render/spec';
import { actorSchema, type Actor } from '../../lib/theme-status';
import { updateAccountSchema, type UpdateAccountInput } from '../../lib/validation/account';
import { storageKeySchema } from '../../lib/validation/storage';
import { AppError } from '../errors';

export async function updateAccount(
  raw: UpdateAccountInput,
  actor: Actor,
): Promise<{ data: { ok: true }; tags: string[] }> {
  const input = updateAccountSchema.safeParse(raw);
  if (!input.success) throw new AppError('VALIDATION');
  const principal = actorSchema.parse(actor);
  if (principal.kind !== 'user') throw new AppError('FORBIDDEN');
  const updated = await dbPool
    .update(user)
    .set(input.data)
    .where(and(eq(user.id, principal.userId), sql`${user.banned} IS NOT TRUE`))
    .returning({ id: user.id });
  if (!updated.length) throw new AppError('FORBIDDEN');
  return { data: { ok: true }, tags: [] };
}

/** Explicit projections exclude authentication credentials, sessions and internal moderation data. */
export async function exportAccountData(userId: string): Promise<Record<string, unknown>> {
  const id = z.string().min(1).parse(userId);
  return dbPool.transaction(
    async (tx) => {
      const [profile] = await tx
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
          locale: user.locale,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })
        .from(user)
        .where(and(eq(user.id, id), sql`${user.banned} IS NOT TRUE`));
      if (!profile) throw new AppError('FORBIDDEN');
      const favoriteRows = await tx
        .select({ themeId: favorites.themeId, createdAt: favorites.createdAt })
        .from(favorites)
        .where(eq(favorites.userId, id))
        .orderBy(desc(favorites.createdAt));
      const ownedCollections = await tx
        .select({
          id: collections.id,
          titleEn: collections.titleEn,
          titleAr: collections.titleAr,
          visibility: collections.visibility,
          createdAt: collections.createdAt,
          updatedAt: collections.updatedAt,
        })
        .from(collections)
        .where(and(eq(collections.ownerId, id), eq(collections.kind, 'user')));
      const items = ownedCollections.length
        ? await tx
            .select({
              collectionId: collectionItems.collectionId,
              themeId: collectionItems.themeId,
              position: collectionItems.position,
              addedAt: collectionItems.addedAt,
            })
            .from(collectionItems)
            .where(
              inArray(
                collectionItems.collectionId,
                ownedCollections.map((row) => row.id),
              ),
            )
            .orderBy(asc(collectionItems.collectionId), asc(collectionItems.position))
        : [];
      const ownedThemes = await tx
        .select({
          id: themes.id,
          slug: themes.slug,
          source: themes.source,
          status: themes.status,
          nameEn: themes.nameEn,
          nameAr: themes.nameAr,
          descriptionEn: themes.descriptionEn,
          descriptionAr: themes.descriptionAr,
          spec: themes.spec,
          remixOfId: themes.remixOfId,
          createdAt: themes.createdAt,
          updatedAt: themes.updatedAt,
          publishedAt: themes.publishedAt,
        })
        .from(themes)
        .where(eq(themes.ownerId, id))
        .orderBy(desc(themes.createdAt));
      const [creator] = await tx
        .select({
          handle: creatorProfiles.handle,
          displayName: creatorProfiles.displayName,
          bio: creatorProfiles.bio,
          links: creatorProfiles.links,
          status: creatorProfiles.status,
          isAdult: creatorProfiles.isAdult,
          appliedAt: creatorProfiles.appliedAt,
          reviewedAt: creatorProfiles.reviewedAt,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.userId, id));
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        profile,
        favorites: favoriteRows,
        collections: ownedCollections.map((collection) => ({
          ...collection,
          items: items.filter((item) => item.collectionId === collection.id),
        })),
        remixes: ownedThemes
          .filter((theme) => theme.source === 'remix')
          .map((theme) => ({
            ...theme,
            spec: themeSpecSchema.parse(theme.spec),
          })),
        creatorProfile: creator ?? null,
        themes: ownedThemes.map((theme) => ({
          id: theme.id,
          slug: theme.slug,
          source: theme.source,
          status: theme.status,
          nameEn: theme.nameEn,
          nameAr: theme.nameAr,
          descriptionEn: theme.descriptionEn,
          descriptionAr: theme.descriptionAr,
          remixOfId: theme.remixOfId,
          createdAt: theme.createdAt,
          updatedAt: theme.updatedAt,
          publishedAt: theme.publishedAt,
        })),
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

// Called only after Better Auth validates the deletion request. The account lock
// spans capture and its actual deletion, so uploads cannot finish in a hook gap.
export async function deleteAccountAndContent(userId: string): Promise<AccountCleanupPlan> {
  const id = z.string().min(1).parse(userId);
  return dbPool.transaction(async (tx) => {
    const [principal] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, id))
      .for('update');
    if (!principal)
      return {
        userId: id,
        keys: [],
        prefixes: [],
        tags: [CacheTags.themes, CacheTags.collections],
      };
    // The creator profile disappears in the auth cascade, so capture its public tag first.
    const [creator] = await tx
      .select({ handle: creatorProfiles.handle })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, id))
      .limit(1);
    const uploaded = await tx
      .select({
        incomingKey: uploads.incomingKey,
        fullKey: uploads.fullKey,
        previewKey: uploads.previewKey,
      })
      .from(uploads)
      .where(eq(uploads.ownerId, id));
    const removed = await tx
      .delete(themes)
      .where(and(eq(themes.ownerId, id), ne(themes.status, 'published')))
      .returning({ id: themes.id });
    const candidateKeys = [
      ...new Set(
        uploaded.flatMap((row) =>
          [row.incomingKey, row.fullKey, row.previewKey].filter(
            (key): key is string => key !== null,
          ),
        ),
      ),
    ];
    // Published themes survive account deletion. Keep their original photo source usable too.
    const retained = candidateKeys.length
      ? await tx.select({ spec: themes.spec }).from(themes).where(sql`
      ${themes.spec}->'wallpaper'->>'assetKey' = ANY(${sql`ARRAY[${sql.join(
        candidateKeys.map((key) => sql`${key}`),
        sql`, `,
      )}]::text[]`})
      OR ${themes.spec}->'lockWallpaper'->>'assetKey' = ANY(${sql`ARRAY[${sql.join(
        candidateKeys.map((key) => sql`${key}`),
        sql`, `,
      )}]::text[]`})
    `)
      : [];
    const referenced = new Set(
      retained.flatMap((row) =>
        [row.spec.wallpaper, row.spec.lockWallpaper].flatMap((wallpaper) =>
          wallpaper?.kind === 'image' ? [wallpaper.assetKey] : [],
        ),
      ),
    );
    const plan: AccountCleanupPlan = {
      userId: id,
      keys: candidateKeys
        .filter((key) => !referenced.has(key))
        .map((key) => storageKeySchema.parse(key)),
      prefixes: removed.map((row) => `themes/${row.id}/`),
      tags: [
        CacheTags.themes,
        CacheTags.collections,
        ...(creator ? [CacheTags.creator(creator.handle)] : []),
      ],
    };
    // FK cascades remove sessions, accounts, uploads and private collections;
    // published themes keep their anonymous owner and their referenced photos.
    await tx.delete(user).where(eq(user.id, id));
    return plan;
  });
}
