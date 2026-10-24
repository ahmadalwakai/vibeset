import { randomUUID } from 'node:crypto';
import { neon, Pool } from '@neondatabase/serverless';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as pooledDrizzle } from 'drizzle-orm/neon-serverless';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { playgroundStateSchema, renderSampleSpec } from '../../content/render-sample';
import { user } from '../../db/schema/auth';
import { collectionItems, collections } from '../../db/schema/collections';
import { favorites } from '../../db/schema/engagement';
import { creatorProfiles } from '../../db/schema/moderation';
import { uploads } from '../../db/schema/system';
import { themes } from '../../db/schema/themes';
import type { AccountCleanupPlan } from '../../lib/account';
import type { Actor } from '../../lib/theme-status';
import type * as AccountService from '../../server/services/account';

vi.mock('server-only', () => ({}));
const holder = vi.hoisted(() => ({
  pooled: undefined as unknown,
  database: undefined as unknown,
  userId: '',
}));
vi.mock('../../db/pool', () => ({
  get dbPool(): unknown {
    return holder.pooled;
  },
}));
vi.mock('../../db/index', () => ({
  get db(): unknown {
    return holder.database;
  },
}));
vi.mock('../../server/guards', () => ({
  requireUser: async () => ({ user: { id: holder.userId } }),
}));
const url = process.env.TEST_DATABASE_URL?.trim();
const token = randomUUID();
const ownerId = `p11-account-${token}`;
const otherId = `p11-other-${token}`;
const actor: Actor = { kind: 'user', userId: ownerId, role: 'user', isCreator: false };
const themeIds = Array.from({ length: 3 }, () => randomUUID());
const [publishedId = '', remixId = '', otherThemeId = ''] = themeIds;
const uploadIds = Array.from({ length: 2 }, () => randomUUID());
const collectionId = randomUUID();
const publishedPhotoKey = `uploads/wallpapers/${uploadIds[0]}/full.jpg`;
const privatePhotoKey = `uploads/wallpapers/${uploadIds[1]}/full.jpg`;

describe.skipIf(!url)('account data and cleanup against isolated fixtures', () => {
  let pool: Pool;
  let database: ReturnType<typeof drizzle>;
  let service: typeof AccountService;
  let plan: AccountCleanupPlan;
  beforeAll(async () => {
    if (!url || url === process.env.DATABASE_URL)
      throw new Error('A separate test database is required');
    database = drizzle({ client: neon(url) });
    holder.database = database;
    holder.userId = ownerId;
    pool = new Pool({ connectionString: url, max: 4 });
    holder.pooled = pooledDrizzle({ client: pool });
    service = await import('../../server/services/account');
    await database.insert(user).values(
      [ownerId, otherId].map((id) => ({
        id,
        name: 'Disposable account fixture',
        email: `${id}@example.invalid`,
        role: 'user',
      })),
    );
    await database.insert(creatorProfiles).values({
      userId: ownerId,
      handle: `p11_${token.replaceAll('-', '').slice(0, 18)}`,
      displayName: 'Disposable creator',
      isAdult: true,
      status: 'approved',
    });
    const spec = renderSampleSpec(playgroundStateSchema.parse({ seed: 20112233 }));
    await database.insert(themes).values(
      themeIds.map((id, index) => ({
        id,
        slug: `p11-account-${id}`,
        ownerId: index === 2 ? otherId : ownerId,
        source: index === 1 ? ('remix' as const) : ('creator' as const),
        status: index === 0 ? ('published' as const) : ('draft' as const),
        nameEn: `Account fixture ${index}`,
        specHash: id,
        spec:
          index === 2
            ? spec
            : {
                ...spec,
                wallpaper: {
                  kind: 'image' as const,
                  assetKey: index === 0 ? publishedPhotoKey : privatePhotoKey,
                  focalX: 0.5,
                  focalY: 0.5,
                  dim: 0,
                },
              },
      })),
    );
    await database.insert(uploads).values(
      uploadIds.map((id, index) => ({
        id,
        ownerId,
        status: 'ready' as const,
        contentType: 'image/jpeg',
        incomingKey: `uploads/incoming/${ownerId}/${id}`,
        fullKey: index === 0 ? publishedPhotoKey : privatePhotoKey,
        previewKey: `uploads/wallpapers/${id}/preview.webp`,
      })),
    );
    await database.insert(favorites).values({ userId: ownerId, themeId: publishedId });
    await database.insert(collections).values({
      id: collectionId,
      kind: 'user',
      ownerId,
      titleEn: 'Private fixture',
      visibility: 'private',
    });
    await database
      .insert(collectionItems)
      .values({ collectionId, themeId: publishedId, position: 0 });
  });
  afterAll(async () => {
    try {
      if (database) {
        await database.delete(themes).where(inArray(themes.id, themeIds));
        await database.delete(user).where(inArray(user.id, [ownerId, otherId]));
      }
    } finally {
      await pool?.end();
      holder.pooled = undefined;
      holder.database = undefined;
    }
  });
  it('updates only the guarded account with normalized profile input', async () => {
    expect(await service.updateAccount({ name: '  My name  ', locale: 'ar' }, actor)).toEqual({
      data: { ok: true },
      tags: [],
    });
    expect(
      await database
        .select({ name: user.name, locale: user.locale })
        .from(user)
        .where(eq(user.id, ownerId)),
    ).toEqual([{ name: 'My name', locale: 'ar' }]);
    expect(
      (await database.select({ name: user.name }).from(user).where(eq(user.id, otherId)))[0]?.name,
    ).toBe('Disposable account fixture');
    await expect(service.updateAccount({ name: '', locale: 'en' }, actor)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(
      service.updateAccount(
        { name: 'System', locale: 'en' },
        { kind: 'system', label: 'integration' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('exports complete owned data with explicit projections and no authentication secrets', async () => {
    const exported = JSON.parse(JSON.stringify(await service.exportAccountData(ownerId)));
    expect(Object.keys(exported).sort()).toEqual([
      'collections',
      'creatorProfile',
      'exportedAt',
      'favorites',
      'profile',
      'remixes',
      'themes',
      'version',
    ]);
    expect(exported.profile).toMatchObject({ id: ownerId, name: 'My name', locale: 'ar' });
    expect(exported.favorites).toHaveLength(1);
    expect(exported.collections[0].items).toHaveLength(1);
    expect(exported.creatorProfile.status).toBe('approved');
    expect(exported.remixes).toHaveLength(1);
    expect(exported.remixes[0].spec.wallpaper.assetKey).toBe(privatePhotoKey);
    expect(exported.themes).toHaveLength(2);
    expect(exported.themes.some((theme: { id: string }) => theme.id === otherThemeId)).toBe(false);
    expect(exported.themes.every((theme: object) => !Object.hasOwn(theme, 'spec'))).toBe(true);
    for (const key of ['password', 'accessToken', 'refreshToken', 'token', 'banned', 'banReason'])
      expect(exported.profile).not.toHaveProperty(key);
  });
  it('returns only owned draft remixes and hides another account’s private design', async () => {
    const query = await import('../../server/admin-queries/user');
    const page = await query.listMyRemixes();
    expect(page.items.map((row) => row.id)).toEqual([remixId]);
    expect(page.items[0]?.updatedAt).toMatch(/^\d{4}-/);
    expect(page.nextCursor).toBeNull();
    expect(await query.getMyRemix(otherThemeId)).toBeNull();
    expect(await query.getMyRemix(publishedId)).toBeNull();
    expect((await query.getMyRemix(remixId))?.id).toBe(remixId);
    await expect(query.getMyRemix('invalid')).rejects.toThrow();
    await expect(query.listMyRemixes({ cursor: 'invalid' })).rejects.toThrow();
  });
  it('removes private themes and captures only unused R2 keys after the DB mutation', async () => {
    plan = await service.cleanupUserContent(ownerId);
    expect(plan.prefixes).toEqual([`themes/${remixId}/`]);
    expect(plan.keys).toContain(privatePhotoKey);
    expect(plan.keys).not.toContain(publishedPhotoKey);
    expect(plan.keys).toHaveLength(5);
    expect(plan.tags).toEqual([
      'themes',
      'collections',
      `creator:p11_${token.replaceAll('-', '').slice(0, 18)}`,
    ]);
    expect(
      (await database.select({ id: themes.id }).from(themes).where(inArray(themes.id, themeIds)))
        .map((row) => row.id)
        .sort(),
    ).toEqual([publishedId, otherThemeId].sort());
  });
  it('rechecks bans for profile mutation and export', async () => {
    await database.update(user).set({ banned: true }).where(eq(user.id, ownerId));
    await expect(
      service.updateAccount({ name: 'Blocked', locale: 'en' }, actor),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.exportAccountData(ownerId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await database.update(user).set({ banned: false }).where(eq(user.id, ownerId));
  });
});
