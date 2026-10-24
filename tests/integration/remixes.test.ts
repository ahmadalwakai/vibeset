import { randomUUID } from 'node:crypto';
import { neon, Pool } from '@neondatabase/serverless';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { playgroundStateSchema, renderSampleSpec } from '../../content/render-sample';
import { user } from '../../db/schema/auth';
import { creatorProfiles } from '../../db/schema/moderation';
import { auditLog, uploads } from '../../db/schema/system';
import { themes } from '../../db/schema/themes';
import { specHash } from '../../lib/render/hash';
import type { ThemeSpec } from '../../lib/render/spec';
import type { Actor } from '../../lib/theme-status';
import type * as RemixService from '../../server/services/remixes';
import type * as AuditService from '../../server/audit';

vi.mock('server-only', () => ({}));
const holder = vi.hoisted(() => ({ database: undefined as unknown, pooled: undefined as unknown }));
vi.mock('../../db/index', () => ({
  get db(): unknown {
    if (!holder.database) throw new Error('Isolated remix database is not ready');
    return holder.database;
  },
}));
vi.mock('../../db/pool', () => ({
  get dbPool(): unknown {
    if (!holder.pooled) throw new Error('Isolated remix transaction database is not ready');
    return holder.pooled;
  },
}));

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const token = randomUUID();
const people = ['user', 'creator', 'admin', 'other', 'banned'].map(
  (role) => `p10-${role}-${token}`,
);
const [ordinaryId = '', creatorId = '', adminId = '', otherId = '', bannedId = ''] = people;
const ordinary: Actor = { kind: 'user', userId: ordinaryId, role: 'user', isCreator: false };
const creator: Actor = { kind: 'user', userId: creatorId, role: 'user', isCreator: true };
const admin: Actor = { kind: 'user', userId: adminId, role: 'admin', isCreator: false };
const spec = renderSampleSpec(playgroundStateSchema.parse({}));
const themeIds = new Set<string>();
const uploadIds = Array.from({ length: 6 }, () => randomUUID());
const keys = uploadIds.map((id) => `uploads/wallpapers/${id}/full.jpg`);
const [
  homeKey = '',
  lockKey = '',
  foreignKey = '',
  pendingKey = '',
  rejectedKey = '',
  adminKey = '',
] = keys;

function photoSpec(home: string | null = homeKey, lock: string | null = null): ThemeSpec {
  return {
    ...spec,
    wallpaper: home
      ? { kind: 'image', assetKey: home, focalX: 0.5, focalY: 0.5, dim: 0 }
      : spec.wallpaper,
    lockWallpaper: lock
      ? { kind: 'image', assetKey: lock, focalX: 0.5, focalY: 0.5, dim: 0 }
      : null,
  };
}

describe.skipIf(!TEST_DATABASE_URL)('private remix services against isolated Neon fixtures', () => {
  let database: ReturnType<typeof drizzle>;
  let pool: Pool | undefined;
  let service: typeof RemixService;
  let audit: typeof AuditService;
  let publicSlug: string;
  let privateSlug: string;

  beforeAll(async () => {
    const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
    database = drizzle({ client: neon(url) });
    pool = new Pool({ connectionString: url, max: 5 });
    holder.database = database;
    holder.pooled = drizzlePool({ client: pool });
    service = await import('../../server/services/remixes');
    audit = await import('../../server/audit');
    await database
      .insert(user)
      .values(
        people.map((id) => ({
          id,
          name: 'Disposable remix fixture',
          email: `${id}@example.invalid`,
          emailVerified: true,
          role: id === adminId ? 'admin' : 'user',
          banned: id === bannedId,
        })),
      );
    await database
      .insert(creatorProfiles)
      .values({
        userId: creatorId,
        handle: `p10_${token.replaceAll('-', '').slice(0, 16)}`,
        displayName: 'Disposable creator',
        isAdult: true,
        status: 'approved',
      });
    await database
      .insert(uploads)
      .values(
        uploadIds.map((id, index) => ({
          id,
          ownerId: index === 2 ? otherId : index === 5 ? adminId : creatorId,
          status:
            index === 3
              ? ('pending' as const)
              : index === 4
                ? ('rejected' as const)
                : ('ready' as const),
          incomingKey: `uploads/incoming/${token}/${id}`,
          fullKey: keys[index],
          contentType: 'image/jpeg',
          bytes: 100,
          width: 1080,
          height: 1920,
        })),
      );
    publicSlug = (await fixture('published', 'generated')).slug;
    privateSlug = (await fixture('draft', 'creator')).slug;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try {
      if (database) {
        const remaining = await database
          .select({ id: themes.id })
          .from(themes)
          .where(inArray(themes.ownerId, people));
        for (const row of remaining) themeIds.add(row.id);
        if (themeIds.size) {
          await database.delete(auditLog).where(inArray(auditLog.entityId, [...themeIds]));
          await database.delete(themes).where(inArray(themes.id, [...themeIds]));
        }
        await database.delete(uploads).where(inArray(uploads.id, uploadIds));
        await database.delete(user).where(inArray(user.id, people));
      }
    } finally {
      await pool?.end();
      holder.database = undefined;
      holder.pooled = undefined;
    }
  });

  async function fixture(
    status: typeof themes.$inferInsert.status = 'draft',
    source: typeof themes.$inferInsert.source = 'remix',
    ownerId = ordinaryId,
  ): Promise<typeof themes.$inferSelect> {
    const id = randomUUID();
    themeIds.add(id);
    const [row] = await database
      .insert(themes)
      .values({
        id,
        slug: `p10-fixture-${id}`,
        status,
        source,
        ownerId,
        nameEn: 'Disposable fixture',
        spec,
        specHash: await specHash(spec),
      })
      .returning();
    if (!row) throw new Error('Remix fixture insertion failed');
    return row;
  }
  async function save(design = spec, actor = ordinary, sourceSlug?: string): Promise<string> {
    const result = await service.saveRemix(
      {
        spec: design,
        nameEn: 'Same display name',
        ...(sourceSlug ? { remixOfSlug: sourceSlug } : {}),
      },
      actor,
    );
    themeIds.add(result.data.id);
    expect(result.tags).toEqual([]);
    return result.data.id;
  }
  async function read(id: string) {
    const [row] = await database.select().from(themes).where(eq(themes.id, id));
    return row;
  }
  async function events(id: string) {
    return database.select().from(auditLog).where(eq(auditLog.entityId, id));
  }

  it('saves normalized specs as unique private drafts with published source lineage and atomic audit', async () => {
    const design = { ...spec, palette: { ...spec.palette, bg: '#ABCDEF' } };
    const first = await save(design, ordinary, publicSlug);
    const second = await save(design, ordinary, publicSlug);
    expect(second).not.toBe(first);
    const row = await read(first);
    expect(row).toMatchObject({
      ownerId: ordinaryId,
      status: 'draft',
      source: 'remix',
      assetVersion: 0,
      assets: null,
      assetsSpecHash: null,
      nameEn: 'Same display name',
      isFeatured: false,
      publishedAt: null,
    });
    expect(row?.slug).toBe(`remix-${first}`);
    expect(row?.spec.palette.bg).toBe('#abcdef');
    expect(row?.specHash).toBe(
      await specHash({ ...design, palette: { ...design.palette, bg: '#abcdef' } }),
    );
    const [source] = await database
      .select({ id: themes.id })
      .from(themes)
      .where(eq(themes.slug, publicSlug));
    expect(row?.remixOfId).toBe(source?.id);
    const records = await events(first);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      actorId: ordinaryId,
      action: 'remix.created',
      entityType: 'theme',
      meta: { specHash: row?.specHash, remixOfId: source?.id },
    });
    expect(records[0]?.meta).not.toHaveProperty('spec');
  });

  it('refuses private or nonexistent source slugs without creating a remix', async () => {
    for (const slug of [privateSlug, `missing-${token}`])
      await expect(
        service.saveRemix({ spec, nameEn: 'Private source', remixOfSlug: slug }, ordinary),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(
      await database
        .select({ id: themes.id })
        .from(themes)
        .where(and(eq(themes.ownerId, ordinaryId), eq(themes.nameEn, 'Private source'))),
    ).toEqual([]);
  });

  it('checks both photo slots and ignores spoofed creator/admin actor flags', async () => {
    for (const design of [photoSpec(), photoSpec(null, lockKey)]) {
      await expect(
        service.saveRemix({ spec: design, nameEn: 'Forbidden photo' }, ordinary),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        service.saveRemix(
          { spec: design, nameEn: 'Spoofed role' },
          { ...ordinary, role: 'admin', isCreator: true },
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('permits approved creators and admins only with their own READY uploads', async () => {
    const creatorRemix = await save(photoSpec(homeKey, lockKey), creator);
    expect((await read(creatorRemix))?.spec.lockWallpaper).toMatchObject({
      kind: 'image',
      assetKey: lockKey,
    });
    expect((await read(await save(photoSpec(adminKey), admin)))?.ownerId).toBe(adminId);
    for (const key of [
      foreignKey,
      pendingKey,
      rejectedKey,
      `uploads/wallpapers/${randomUUID()}/full.jpg`,
    ])
      await expect(
        service.saveRemix(
          { spec: photoSpec(homeKey, key), nameEn: 'Unauthorized lock photo' },
          creator,
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      service.saveRemix({ spec: photoSpec(homeKey), nameEn: 'Admin foreign photo' }, admin),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('uses current creator status and account bans for saves and existing draft mutations', async () => {
    const id = await save();
    await database
      .update(creatorProfiles)
      .set({ status: 'suspended' })
      .where(eq(creatorProfiles.userId, creatorId));
    try {
      await expect(
        service.saveRemix({ spec: photoSpec(), nameEn: 'Suspended' }, creator),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    } finally {
      await database
        .update(creatorProfiles)
        .set({ status: 'approved' })
        .where(eq(creatorProfiles.userId, creatorId));
    }
    await expect(
      service.saveRemix({ spec, nameEn: 'Banned' }, { ...ordinary, userId: bannedId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      service.saveRemix(
        { spec, nameEn: 'Missing account' },
        { ...ordinary, userId: `missing-${token}` },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await database.update(user).set({ banned: true }).where(eq(user.id, ordinaryId));
    try {
      await expect(
        service.updateRemix({ id, spec, nameEn: 'Banned update' }, ordinary),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(service.deleteRemix({ id }, ordinary)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    } finally {
      await database.update(user).set({ banned: false }).where(eq(user.id, ordinaryId));
    }
    expect((await read(id))?.nameEn).toBe('Same display name');
    expect(await events(id)).toHaveLength(1);
  });

  it('updates only editable fields and leaves no-op timestamps/audits unchanged', async () => {
    const id = await save(spec, ordinary, publicSlug);
    const before = await read(id);
    const changed = { ...spec, icons: { ...spec.icons, shadow: !spec.icons.shadow } };
    expect(
      await service.updateRemix(
        { id: id.toUpperCase(), spec: changed, nameEn: 'Renamed' },
        ordinary,
      ),
    ).toEqual({ data: { id }, tags: [] });
    const after = await read(id);
    expect(after).toMatchObject({
      nameEn: 'Renamed',
      spec: changed,
      specHash: await specHash(changed),
      remixOfId: before?.remixOfId,
      slug: before?.slug,
      status: 'draft',
      source: 'remix',
      assetVersion: 0,
    });
    await service.updateRemix({ id, spec: changed, nameEn: 'Renamed' }, ordinary);
    expect((await read(id))?.updatedAt).toEqual(after?.updatedAt);
    expect((await events(id)).map(({ action }) => action).sort()).toEqual([
      'remix.created',
      'remix.updated',
    ]);
    await expect(
      service.updateRemix({ id, spec: photoSpec(), nameEn: 'Sneak photo' }, ordinary),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await read(id))?.specHash).toBe(after?.specHash);
  });

  it('denies other owners, administrator overrides, non-remix sources and every non-draft status', async () => {
    const id = await save();
    for (const actor of [{ ...ordinary, userId: otherId }, admin]) {
      await expect(
        service.updateRemix({ id, spec, nameEn: 'Intruder' }, actor),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(service.deleteRemix({ id }, actor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
    const otherSource = await fixture('draft', 'creator');
    await expect(service.deleteRemix({ id: otherSource.id }, ordinary)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      service.updateRemix({ id: otherSource.id, spec, nameEn: 'Wrong source' }, ordinary),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    for (const status of [
      'pending_review',
      'approved',
      'published',
      'rejected',
      'archived',
    ] as const) {
      const row = await fixture(status);
      await expect(
        service.updateRemix({ id: row.id, spec, nameEn: 'Wrong status' }, ordinary),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      await expect(service.deleteRemix({ id: row.id }, ordinary)).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
      expect(await events(row.id)).toHaveLength(0);
    }
  }, 30_000);

  it('deletes its owned draft and records one matching deletion audit', async () => {
    const id = await save();
    expect(await service.deleteRemix({ id }, ordinary)).toEqual({ data: { id }, tags: [] });
    expect(await read(id)).toBeUndefined();
    expect((await events(id)).map(({ action }) => action).sort()).toEqual([
      'remix.created',
      'remix.deleted',
    ]);
    await expect(service.deleteRemix({ id }, ordinary)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await events(id)).toHaveLength(2);
  });

  it('rolls back each mutation if its audit cannot be written', async () => {
    const fail = (): never => {
      throw new Error('Injected audit failure');
    };
    vi.spyOn(audit, 'auditInsert').mockImplementationOnce(fail);
    await expect(service.saveRemix({ spec, nameEn: 'Rollback create' }, ordinary)).rejects.toThrow(
      'Injected audit failure',
    );
    expect(
      await database
        .select({ id: themes.id })
        .from(themes)
        .where(and(eq(themes.ownerId, ordinaryId), eq(themes.nameEn, 'Rollback create'))),
    ).toEqual([]);
    const id = await save();
    vi.spyOn(audit, 'auditInsert').mockImplementationOnce(fail);
    await expect(
      service.updateRemix({ id, spec, nameEn: 'Rollback update' }, ordinary),
    ).rejects.toThrow('Injected audit failure');
    expect((await read(id))?.nameEn).toBe('Same display name');
    vi.spyOn(audit, 'auditInsert').mockImplementationOnce(fail);
    await expect(service.deleteRemix({ id }, ordinary)).rejects.toThrow('Injected audit failure');
    expect(await read(id)).toBeDefined();
    expect(await events(id)).toHaveLength(1);
  });
});
