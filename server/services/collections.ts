import 'server-only';

import { and, asc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { dbPool } from '../../db/pool';
import { user } from '../../db/schema/auth';
import { collections, collectionItems } from '../../db/schema/collections';
import { themes } from '../../db/schema/themes';
import { MAX_COLLECTION_ITEMS, MAX_USER_COLLECTIONS } from '../../lib/collections';
import { actorSchema } from '../../lib/theme-status';
import type { Actor } from '../../lib/theme-status';
import {
  createCollectionSchema,
  updateCollectionSchema,
  deleteCollectionSchema,
  collectionItemSchema,
  reorderCollectionSchema,
} from '../../lib/validation/collections';
import type {
  CreateCollectionInput,
  UpdateCollectionInput,
  DeleteCollectionInput,
  CollectionItemInput,
  ReorderCollectionInput,
} from '../../lib/validation/collections';
import { auditInsert } from '../audit';
import { AppError } from '../errors';

type Transaction = Parameters<Parameters<typeof dbPool.transaction>[0]>[0];
type UserActor = Extract<Actor, { kind: 'user' }>;
interface Mutation<T> {
  data: T;
  tags: string[];
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError('VALIDATION', 'Invalid collection input');
  return result.data;
}
function actorIdentity(actor: Actor): UserActor {
  const value = parse(actorSchema, actor);
  if (value.kind !== 'user') throw new AppError('FORBIDDEN');
  return value;
}
async function principal(tx: Transaction, actor: UserActor, creating = false): Promise<string> {
  const [account] = await tx
    .select({ id: user.id, banned: user.banned })
    .from(user)
    .where(eq(user.id, actor.userId))
    .for(creating ? 'update' : 'share');
  if (!account) throw new AppError('UNAUTHENTICATED');
  if (account.banned) throw new AppError('FORBIDDEN');
  return account.id;
}
async function owned(
  tx: Transaction,
  id: string,
  ownerId: string,
): Promise<typeof collections.$inferSelect> {
  const [collection] = await tx
    .select()
    .from(collections)
    .where(and(eq(collections.id, id), eq(collections.kind, 'user')))
    .for('update');
  if (!collection) throw new AppError('NOT_FOUND');
  if (collection.ownerId !== ownerId) throw new AppError('FORBIDDEN');
  return collection;
}
async function members(
  tx: Transaction,
  id: string,
  lockThemes = false,
): Promise<{ id: string; position: number; status: typeof themes.$inferSelect.status }[]> {
  const query = tx
    .select({
      id: collectionItems.themeId,
      position: collectionItems.position,
      status: themes.status,
    })
    .from(collectionItems)
    .innerJoin(themes, eq(themes.id, collectionItems.themeId))
    .where(eq(collectionItems.collectionId, id))
    .orderBy(asc(collectionItems.position), asc(collectionItems.themeId));
  return lockThemes ? query.for('share', { of: themes }) : query;
}
async function positions(tx: Transaction, id: string, ids: readonly string[]): Promise<number> {
  if (!ids.length) return 0;
  const values = sql.join(
    ids.map((themeId, position) => sql`(${themeId}::uuid, ${position}::int)`),
    sql`, `,
  );
  const result = await tx.execute(sql`
    UPDATE ${collectionItems} AS ci SET position = desired.position
    FROM (VALUES ${values}) AS desired(theme_id, position)
    WHERE ci.collection_id = ${id}::uuid AND ci.theme_id = desired.theme_id AND ci.position IS DISTINCT FROM desired.position
    RETURNING ci.theme_id
  `);
  return result.rows.length;
}
async function log(
  tx: Transaction,
  ownerId: string,
  id: string,
  action: string,
  meta: Record<string, unknown>,
): Promise<void> {
  await tx.execute(
    auditInsert({ actorId: ownerId, action, entityType: 'collection', entityId: id, meta }),
  );
}
function target(id: string, ownerId: string): SQL | undefined {
  return and(
    eq(collections.id, id),
    eq(collections.ownerId, ownerId),
    eq(collections.kind, 'user'),
  );
}

export async function createCollection(
  input: CreateCollectionInput,
  actor: Actor,
): Promise<Mutation<{ id: string }>> {
  const value = parse(createCollectionSchema, input),
    identity = actorIdentity(actor);
  return dbPool.transaction(async (tx) => {
    const ownerId = await principal(tx, identity, true);
    const existing = await tx
      .select({ id: collections.id })
      .from(collections)
      .where(and(eq(collections.ownerId, ownerId), eq(collections.kind, 'user')))
      .limit(MAX_USER_COLLECTIONS);
    if (existing.length >= MAX_USER_COLLECTIONS)
      throw new AppError('VALIDATION', 'Collection limit reached', { limit: ['collections'] });
    const [created] = await tx
      .insert(collections)
      .values({
        kind: 'user',
        ownerId,
        titleEn: value.titleEn,
        visibility: value.visibility,
        slug: null,
      })
      .returning({ id: collections.id });
    if (!created) throw new AppError('INTERNAL');
    await log(tx, ownerId, created.id, 'collection.created', {
      titleEn: value.titleEn,
      visibility: value.visibility,
    });
    return { data: created, tags: [] };
  });
}
export async function updateCollection(
  input: UpdateCollectionInput,
  actor: Actor,
): Promise<Mutation<{ id: string }>> {
  const value = parse(updateCollectionSchema, input),
    identity = actorIdentity(actor);
  return dbPool.transaction(async (tx) => {
    const ownerId = await principal(tx, identity),
      before = await owned(tx, value.id, ownerId);
    const titleEn = value.titleEn ?? before.titleEn,
      visibility = value.visibility ?? before.visibility;
    if (titleEn !== before.titleEn || visibility !== before.visibility) {
      await tx.update(collections).set({ titleEn, visibility }).where(target(before.id, ownerId));
      await log(tx, ownerId, before.id, 'collection.updated', {
        before: { titleEn: before.titleEn, visibility: before.visibility },
        after: { titleEn, visibility },
      });
    }
    return { data: { id: before.id }, tags: [] };
  });
}
export async function deleteCollection(
  input: DeleteCollectionInput,
  actor: Actor,
): Promise<Mutation<{ id: string }>> {
  const value = parse(deleteCollectionSchema, input),
    identity = actorIdentity(actor);
  return dbPool.transaction(async (tx) => {
    const ownerId = await principal(tx, identity),
      before = await owned(tx, value.id, ownerId);
    await tx.delete(collections).where(target(before.id, ownerId));
    await log(tx, ownerId, before.id, 'collection.deleted', {
      titleEn: before.titleEn,
      visibility: before.visibility,
    });
    return { data: { id: before.id }, tags: [] };
  });
}

async function changeItem(
  input: CollectionItemInput,
  actor: Actor,
  adding: boolean,
): Promise<Mutation<{ itemCount: number }>> {
  const value = parse(collectionItemSchema, input),
    identity = actorIdentity(actor);
  return dbPool.transaction(async (tx) => {
    const ownerId = await principal(tx, identity);
    await owned(tx, value.collectionId, ownerId);
    if (adding) {
      const [theme] = await tx
        .select({ id: themes.id })
        .from(themes)
        .where(and(eq(themes.id, value.themeId), eq(themes.status, 'published')))
        .for('share');
      if (!theme) throw new AppError('NOT_FOUND');
    }
    const before = await members(tx, value.collectionId);
    const exists = before.some(({ id }) => id === value.themeId);
    if (adding && !exists && before.length >= MAX_COLLECTION_ITEMS)
      throw new AppError('VALIDATION', 'Collection item limit reached', { limit: ['items'] });
    const changed = adding ? !exists : exists;
    if (changed) {
      if (adding)
        await tx
          .insert(collectionItems)
          .values({
            collectionId: value.collectionId,
            themeId: value.themeId,
            position: before.length,
          });
      else
        await tx
          .delete(collectionItems)
          .where(
            and(
              eq(collectionItems.collectionId, value.collectionId),
              eq(collectionItems.themeId, value.themeId),
            ),
          );
    }
    const after = await members(tx, value.collectionId);
    const repaired = await positions(
      tx,
      value.collectionId,
      after.map(({ id }) => id),
    );
    if (changed || repaired) {
      await tx
        .update(collections)
        .set({ updatedAt: new Date() })
        .where(target(value.collectionId, ownerId));
      await log(tx, ownerId, value.collectionId, 'collection.updated', {
        operation: adding ? 'add' : 'remove',
        themeId: value.themeId,
        membershipChanged: changed,
        normalizedPositions: repaired > 0,
      });
    }
    return {
      data: { itemCount: after.filter(({ status }) => status === 'published').length },
      tags: [],
    };
  });
}
export async function addToCollection(
  input: CollectionItemInput,
  actor: Actor,
): Promise<Mutation<{ itemCount: number }>> {
  return changeItem(input, actor, true);
}
export async function removeFromCollection(
  input: CollectionItemInput,
  actor: Actor,
): Promise<Mutation<{ itemCount: number }>> {
  return changeItem(input, actor, false);
}

export async function reorderCollection(
  input: ReorderCollectionInput,
  actor: Actor,
): Promise<Mutation<{ ok: true }>> {
  const value = parse(reorderCollectionSchema, input),
    identity = actorIdentity(actor);
  return dbPool.transaction(async (tx) => {
    const ownerId = await principal(tx, identity);
    await owned(tx, value.collectionId, ownerId);
    const before = await members(tx, value.collectionId, true);
    const visible = new Set(
      before.filter(({ status }) => status === 'published').map(({ id }) => id),
    );
    if (visible.size !== value.themeIds.length || value.themeIds.some((id) => !visible.has(id)))
      throw new AppError('CONFLICT', 'Collection membership changed');
    const order = [
      ...value.themeIds,
      ...before.filter(({ status }) => status !== 'published').map(({ id }) => id),
    ];
    if (await positions(tx, value.collectionId, order)) {
      await tx
        .update(collections)
        .set({ updatedAt: new Date() })
        .where(target(value.collectionId, ownerId));
      await log(tx, ownerId, value.collectionId, 'collection.reordered', {
        themeIds: value.themeIds,
      });
    }
    return { data: { ok: true }, tags: [] };
  });
}
