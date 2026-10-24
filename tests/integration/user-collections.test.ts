import { randomUUID } from 'node:crypto';
import { neon, Pool } from '@neondatabase/serverless';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { user } from '../../db/schema/auth';
import { collections, collectionItems } from '../../db/schema/collections';
import { auditLog } from '../../db/schema/system';
import { themes } from '../../db/schema/themes';
import { creatorProfiles } from '../../db/schema/moderation';
import { playgroundStateSchema, renderSampleSpec } from '../../content/render-sample';
import type { Actor } from '../../lib/theme-status';
import type * as CollectionService from '../../server/services/collections';
import type * as CollectionQueries from '../../server/admin-queries/collections';
import type * as AuditService from '../../server/audit';

vi.mock('server-only', () => ({}));
const holder = vi.hoisted(() => ({ database: undefined as unknown, pooled: undefined as unknown }));
const guards = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  cacheTag: vi.fn(() => {
    throw new Error('Private collection query called cacheTag');
  }),
}));
vi.mock('../../db/index', () => ({
  get db(): unknown {
    if (!holder.database) throw new Error('Test database not ready');
    return holder.database;
  },
}));
vi.mock('../../db/pool', () => ({
  get dbPool(): unknown {
    if (!holder.pooled) throw new Error('Test pool not ready');
    return holder.pooled;
  },
}));
vi.mock('../../server/guards', () => ({ getSession: guards.session, requireUser: guards.user }));
vi.mock('../../server/cache', async () => ({
  CacheTags: (await import('../../lib/cache-tags')).CacheTags,
  cacheTag: guards.cacheTag,
}));
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const token = randomUUID(),
  ownerId = `p11-collections-${token}`,
  otherId = `p11-other-${token}`;
const owner: Actor = { kind: 'user', userId: ownerId, role: 'user', isCreator: false };
const collectionIds = new Set<string>(),
  themeIds: string[] = Array.from({ length: 505 }, () => randomUUID());
const spec = renderSampleSpec(playgroundStateSchema.parse({}));

describe.skipIf(!TEST_DATABASE_URL)('private user collections and serialized ordering', () => {
  let database: ReturnType<typeof drizzle>,
    pool: Pool | undefined,
    service: typeof CollectionService,
    queries: typeof CollectionQueries,
    audit: typeof AuditService;
  beforeAll(async () => {
    const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
    database = drizzle({ client: neon(url) });
    pool = new Pool({ connectionString: url, max: 6 });
    holder.database = database;
    holder.pooled = drizzlePool({ client: pool });
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://vibeset.example');
    vi.stubEnv('NEXT_PUBLIC_CDN_URL', 'https://cdn.vibeset.example');
    service = await import('../../server/services/collections');
    queries = await import('../../server/admin-queries/collections');
    audit = await import('../../server/audit');
    await database
      .insert(user)
      .values(
        [ownerId, otherId].map((id) => ({
          id,
          name: 'Disposable collection fixture',
          email: `${id}@example.invalid`,
          role: 'user',
          emailVerified: true,
        })),
      );
    await database
      .insert(creatorProfiles)
      .values({
        userId: otherId,
        handle: `p11_${token.replaceAll('-', '').slice(0, 16)}`,
        displayName: 'Disposable public creator',
        isAdult: true,
        status: 'approved',
      });
    await database
      .insert(themes)
      .values(
        themeIds.map((id) => ({
          id,
          slug: `p11-collection-${id}`,
          nameEn: 'Disposable theme',
          source: 'generated' as const,
          status: 'published' as const,
          ownerId: otherId,
          spec,
          specHash: 'a'.repeat(64),
        })),
      );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    guards.session.mockReset();
    guards.user.mockReset();
  });
  afterAll(async () => {
    try {
      if (database) {
        const remaining = await database
          .select({ id: collections.id })
          .from(collections)
          .where(inArray(collections.ownerId, [ownerId, otherId]));
        for (const row of remaining) collectionIds.add(row.id);
        if (collectionIds.size) {
          await database.delete(auditLog).where(inArray(auditLog.entityId, [...collectionIds]));
          await database.delete(collections).where(inArray(collections.id, [...collectionIds]));
        }
        await database.delete(themes).where(inArray(themes.id, themeIds));
        await database.delete(user).where(inArray(user.id, [ownerId, otherId]));
      }
    } finally {
      await pool?.end();
      holder.database = undefined;
      holder.pooled = undefined;
      vi.unstubAllEnvs();
    }
  });
  async function create(visibility: 'private' | 'unlisted' = 'private'): Promise<string> {
    const result = await service.createCollection({ titleEn: 'My edit', visibility }, owner);
    collectionIds.add(result.data.id);
    expect(result.tags).toEqual([]);
    return result.data.id;
  }
  async function order(id: string) {
    return database
      .select({ id: collectionItems.themeId, position: collectionItems.position })
      .from(collectionItems)
      .where(eq(collectionItems.collectionId, id))
      .orderBy(asc(collectionItems.position), asc(collectionItems.themeId));
  }
  async function events(id: string) {
    return database.select().from(auditLog).where(eq(auditLog.entityId, id));
  }
  function theme(index: number): string {
    const id = themeIds[index];
    if (!id) throw new Error('Missing fixture');
    return id;
  }
  function signedIn(id: string | null): void {
    const session = id ? { user: { id, banned: false } } : null;
    guards.session.mockResolvedValue(session);
    if (session) guards.user.mockResolvedValue(session);
  }

  it('creates private user records and performs no-op updates without timestamp or audit churn', async () => {
    const id = await create(),
      [before] = await database.select().from(collections).where(eq(collections.id, id));
    expect(before).toMatchObject({
      kind: 'user',
      ownerId,
      slug: null,
      visibility: 'private',
      titleEn: 'My edit',
    });
    await service.updateCollection({ id, titleEn: 'My edit' }, owner);
    expect(
      (await database.select().from(collections).where(eq(collections.id, id)))[0]?.updatedAt,
    ).toEqual(before?.updatedAt);
    expect(await events(id)).toHaveLength(1);
    await service.updateCollection({ id, titleEn: 'Changed', visibility: 'unlisted' }, owner);
    expect((await events(id)).map(({ action }) => action).sort()).toEqual([
      'collection.created',
      'collection.updated',
    ]);
  });
  it('rejects other owners and bans independently of supplied actor privileges', async () => {
    const id = await create(),
      intruder: Actor = { ...owner, userId: otherId, role: 'admin' };
    for (const operation of [
      () => service.updateCollection({ id, titleEn: 'Intruder' }, intruder),
      () => service.deleteCollection({ id }, intruder),
      () => service.addToCollection({ collectionId: id, themeId: theme(0) }, intruder),
      () => service.removeFromCollection({ collectionId: id, themeId: theme(0) }, intruder),
      () => service.reorderCollection({ collectionId: id, themeIds: [] }, intruder),
    ])
      await expect(operation()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await database.update(user).set({ banned: true }).where(eq(user.id, ownerId));
    try {
      await expect(service.deleteCollection({ id }, owner)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    } finally {
      await database.update(user).set({ banned: false }).where(eq(user.id, ownerId));
    }
    expect(await events(id)).toHaveLength(1);
  });
  it('serializes concurrent adds, deduplicates repeated add/remove, and keeps contiguous positions', async () => {
    const id = await create();
    await Promise.all(
      [0, 1, 2, 3, 4].map((index) =>
        service.addToCollection({ collectionId: id, themeId: theme(index) }, owner),
      ),
    );
    expect((await order(id)).map(({ position }) => position)).toEqual([0, 1, 2, 3, 4]);
    const first = await order(id);
    const auditCount = (await events(id)).length;
    await Promise.all([
      service.addToCollection({ collectionId: id, themeId: theme(0) }, owner),
      service.addToCollection({ collectionId: id, themeId: theme(0) }, owner),
    ]);
    expect(await order(id)).toEqual(first);
    expect(await events(id)).toHaveLength(auditCount);
    await Promise.all([
      service.removeFromCollection({ collectionId: id, themeId: theme(1) }, owner),
      service.removeFromCollection({ collectionId: id, themeId: theme(3) }, owner),
    ]);
    expect((await order(id)).map(({ position }) => position)).toEqual([0, 1, 2]);
    const count = (await events(id)).length;
    await service.removeFromCollection({ collectionId: id, themeId: theme(1) }, owner);
    expect(await events(id)).toHaveLength(count);
  });
  it('rejects unpublished adds and reorders visible members exactly while retaining hidden memberships', async () => {
    const id = await create();
    for (const index of [5, 6, 7])
      await service.addToCollection({ collectionId: id, themeId: theme(index) }, owner);
    await database
      .update(themes)
      .set({ status: 'archived' })
      .where(eq(themes.id, theme(6)));
    try {
      await expect(
        service.addToCollection({ collectionId: id, themeId: theme(6) }, owner),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await service.reorderCollection({ collectionId: id, themeIds: [theme(7), theme(5)] }, owner);
      expect(await order(id)).toEqual([
        { id: theme(7), position: 0 },
        { id: theme(5), position: 1 },
        { id: theme(6), position: 2 },
      ]);
      await expect(
        service.reorderCollection({ collectionId: id, themeIds: [theme(5)] }, owner),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        service.reorderCollection(
          { collectionId: id, themeIds: [theme(5), theme(7), theme(8)] },
          owner,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    } finally {
      await database
        .update(themes)
        .set({ status: 'published' })
        .where(eq(themes.id, theme(6)));
    }
  });
  it('does not expose private collections, includes only published cards in unlisted reads, and never calls cacheTag', async () => {
    const id = await create();
    await service.addToCollection({ collectionId: id, themeId: theme(10) }, owner);
    await service.addToCollection({ collectionId: id, themeId: theme(11) }, owner);
    signedIn(null);
    expect(await queries.getUserCollection(id)).toBeNull();
    signedIn(otherId);
    expect(await queries.getUserCollection(id)).toBeNull();
    signedIn(ownerId);
    expect((await queries.getUserCollection(id))?.canEdit).toBe(true);
    expect(
      (await queries.listMyCollections(theme(10))).find((row) => row.id === id)?.containsTheme,
    ).toBe(true);
    await service.updateCollection({ id, visibility: 'unlisted' }, owner);
    await database
      .update(themes)
      .set({ status: 'archived' })
      .where(eq(themes.id, theme(11)));
    try {
      signedIn(null);
      const detail = await queries.getUserCollection(id);
      expect(detail).toMatchObject({ canEdit: false, visibility: 'unlisted', itemCount: 1 });
      expect(detail?.items.map(({ id }) => id)).toEqual([theme(10)]);
      expect(detail).not.toHaveProperty('ownerId');
      expect(detail?.items[0]).not.toHaveProperty('spec');
      expect(guards.cacheTag).not.toHaveBeenCalled();
    } finally {
      await database
        .update(themes)
        .set({ status: 'published' })
        .where(eq(themes.id, theme(11)));
    }
  });
  it('enforces the 500-item cap including hidden members', async () => {
    const id = await create();
    await database
      .insert(collectionItems)
      .values(
        themeIds
          .slice(0, 500)
          .map((themeId, position) => ({ collectionId: id, themeId, position })),
      );
    await expect(
      service.addToCollection({ collectionId: id, themeId: theme(500) }, owner),
    ).rejects.toMatchObject({ code: 'VALIDATION', fieldErrors: { limit: ['items'] } });
    expect(
      await service.addToCollection({ collectionId: id, themeId: theme(0) }, owner),
    ).toMatchObject({ data: { itemCount: 500 } });
    expect(await order(id)).toHaveLength(500);
  });
  it('rolls back membership and collection deletion on audit failure; successful delete cascades memberships', async () => {
    const id = await create();
    vi.spyOn(audit, 'auditInsert').mockImplementationOnce(() => {
      throw new Error('Audit unavailable');
    });
    await expect(
      service.addToCollection({ collectionId: id, themeId: theme(12) }, owner),
    ).rejects.toThrow('Audit unavailable');
    expect(await order(id)).toEqual([]);
    await service.addToCollection({ collectionId: id, themeId: theme(12) }, owner);
    vi.spyOn(audit, 'auditInsert').mockImplementationOnce(() => {
      throw new Error('Audit unavailable');
    });
    await expect(service.deleteCollection({ id }, owner)).rejects.toThrow('Audit unavailable');
    expect(await order(id)).toHaveLength(1);
    await service.deleteCollection({ id }, owner);
    expect(await order(id)).toEqual([]);
    expect(await events(id)).toHaveLength(3);
  });
  it('serializes the account collection cap under concurrent creates', async () => {
    const existing = await database
      .select({ id: collections.id })
      .from(collections)
      .where(and(eq(collections.ownerId, ownerId), eq(collections.kind, 'user')));
    const filler = Array.from({ length: Math.max(0, 99 - existing.length) }, () => randomUUID());
    filler.forEach((id) => collectionIds.add(id));
    if (filler.length)
      await database
        .insert(collections)
        .values(
          filler.map((id) => ({
            id,
            ownerId,
            kind: 'user' as const,
            titleEn: 'Cap fixture',
            visibility: 'private' as const,
          })),
        );
    const results = await Promise.allSettled([
      service.createCollection({ titleEn: 'Cap race one', visibility: 'private' }, owner),
      service.createCollection({ titleEn: 'Cap race two', visibility: 'private' }, owner),
    ]);
    const success = results.filter((result) => result.status === 'fulfilled');
    expect(success).toHaveLength(1);
    for (const result of success)
      if (result.status === 'fulfilled') collectionIds.add(result.value.data.id);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'VALIDATION' },
    });
  });
});
