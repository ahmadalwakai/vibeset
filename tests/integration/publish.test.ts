import { randomUUID } from 'node:crypto';
import { neon, type Pool } from '@neondatabase/serverless';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { collections, collectionItems } from '../../db/schema/collections';
import { auditLog } from '../../db/schema/system';
import { themes } from '../../db/schema/themes';
import { playgroundStateSchema, renderSampleSpec } from '../../content/render-sample';
import { specHash } from '../../lib/render/hash';
import type { ThemeSpec } from '../../lib/render/spec';
import type { ObjectStorage } from '../../server/storage/r2';
import type {
  publishTheme as publish,
  cleanupOldVersions as cleanup,
} from '../../server/services/theme-publish';
import type { dbPool as configuredDatabase } from '../../db/pool';
import type * as storageKeys from '../../server/storage/keys';

vi.mock('server-only', () => ({}));

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const actor = { kind: 'system', label: 'integration-publish' } as const;
type StoredObject = { body: Uint8Array; contentType: string; cacheControl: string };
type PutInput = Parameters<ObjectStorage['put']>[0];

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class MemoryStorage implements ObjectStorage {
  objects = new Map<string, StoredObject>();
  puts: PutInput[] = [];
  deletes: { prefix: string; active: number }[] = [];
  gets: string[] = [];
  active = 0;
  maxActive = 0;
  onPut?: (input: PutInput) => Promise<void>;

  async put(input: PutInput): Promise<void> {
    this.puts.push(input);
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      await this.onPut?.(input);
      this.objects.set(input.key, {
        body: input.body.slice(),
        contentType: input.contentType,
        cacheControl: input.cacheControl,
      });
    } finally {
      this.active -= 1;
    }
  }
  async head(key: string): ReturnType<ObjectStorage['head']> {
    const entry = this.objects.get(key);
    return entry ? { bytes: entry.body.byteLength, contentType: entry.contentType } : null;
  }
  async getBytes(key: string): Promise<Uint8Array> {
    this.gets.push(key);
    const entry = this.objects.get(key);
    if (!entry) throw new Error('Missing in-memory object');
    return entry.body.slice();
  }
  async deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) this.objects.delete(key);
  }
  async deletePrefix(prefix: string): Promise<void> {
    this.deletes.push({ prefix, active: this.active });
    for (const key of this.objects.keys()) if (key.startsWith(prefix)) this.objects.delete(key);
  }
  async listPrefixes(prefix: string): Promise<string[]> {
    const children = new Set<string>();
    for (const key of this.objects.keys()) {
      if (!key.startsWith(prefix)) continue;
      const suffix = key.slice(prefix.length);
      const separator = suffix.indexOf('/');
      if (separator >= 0) children.add(`${prefix}${suffix.slice(0, separator + 1)}`);
    }
    return [...children];
  }
  async presignPut(): Promise<string> {
    throw new Error('Publish tests do not presign uploads');
  }
}

describe.skipIf(!TEST_DATABASE_URL)(
  'theme publishing with real rendering and isolated storage',
  () => {
    let database: ReturnType<typeof drizzle>;
    let poolToClose: Pool | undefined;
    let transactionDatabase: typeof configuredDatabase;
    let publishTheme: typeof publish;
    let cleanupOldVersions: typeof cleanup;
    let keys: typeof storageKeys;
    const ownedThemes = new Set<string>();
    const ownedCollections = new Set<string>();

    beforeAll(async () => {
      const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
      database = drizzle({ client: neon(url) });
      for (const [key, value] of Object.entries({
        DATABASE_URL: url,
        DATABASE_URL_UNPOOLED: url,
        NODE_ENV: 'test',
        BETTER_AUTH_URL: 'http://localhost:3000',
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
        BETTER_AUTH_SECRET: 'b'.repeat(32),
        IP_HASH_SALT: 'p'.repeat(32),
        CRON_SECRET: 'c'.repeat(32),
        INTERNAL_API_SECRET: 'i'.repeat(32),
      }))
        vi.stubEnv(key, value);
      vi.stubEnv('VERCEL_ENV', undefined);
      vi.stubEnv('SKIP_ENV_VALIDATION', undefined);
      const { pool, dbPool } = await import('../../db/pool');
      poolToClose = pool;
      transactionDatabase = dbPool;
      ({ publishTheme, cleanupOldVersions } = await import('../../server/services/theme-publish'));
      keys = await import('../../server/storage/keys');
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      if (ownedCollections.size)
        await database.delete(collections).where(inArray(collections.id, [...ownedCollections]));
      if (ownedThemes.size) {
        await database
          .delete(auditLog)
          .where(
            and(eq(auditLog.entityType, 'theme'), inArray(auditLog.entityId, [...ownedThemes])),
          );
        await database.delete(themes).where(inArray(themes.id, [...ownedThemes]));
      }
      ownedThemes.clear();
      ownedCollections.clear();
    });

    afterAll(async () => {
      try {
        await poolToClose?.end();
      } finally {
        vi.unstubAllEnvs();
      }
    });

    function spec(): ThemeSpec {
      return renderSampleSpec(playgroundStateSchema.parse({ kind: 'waves', grain: 0 }));
    }
    async function createTheme(
      themeSpec = spec(),
      status: 'approved' | 'draft' | 'published' | 'archived' = 'approved',
    ) {
      const id = randomUUID();
      ownedThemes.add(id);
      const [created] = await database
        .insert(themes)
        .values({
          id,
          slug: `integration-publish-${id}`,
          nameEn: 'Disposable publish fixture',
          source: 'admin',
          status,
          spec: themeSpec,
          specHash: await specHash(themeSpec),
        })
        .returning();
      if (!created) throw new Error('Fixture insert failed');
      return created;
    }
    async function theme(id: string) {
      return (await database.select().from(themes).where(eq(themes.id, id)))[0];
    }
    async function audits(id: string) {
      return database
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entityType, 'theme'), eq(auditLog.entityId, id)));
    }

    it('publishes real assets, skips current assets, retains two versions, and returns collection tags', async () => {
      const row = await createTheme();
      const collectionId = randomUUID();
      ownedCollections.add(collectionId);
      const collectionSlug = `integration-publish-${collectionId}`;
      await database.insert(collections).values({
        id: collectionId,
        kind: 'editorial',
        slug: collectionSlug,
        titleEn: 'Publish fixture',
        visibility: 'public',
      });
      await database.insert(collectionItems).values({ collectionId, themeId: row.id, position: 0 });
      const storage = new MemoryStorage();
      const first = await publishTheme({ themeId: row.id, actor, storage });
      expect(first.data).toEqual({ assetVersion: 1, skipped: false });
      expect(first.tags).toEqual(
        expect.arrayContaining([
          'themes',
          `theme:${row.slug}`,
          'collections',
          `collection:${collectionSlug}`,
        ]),
      );
      const published = await theme(row.id);
      expect(published).toMatchObject({
        status: 'published',
        assetVersion: 1,
        assetsSpecHash: row.specHash,
        publishError: null,
      });
      expect(published?.previewHash).toMatch(/^[0-9a-f]{16}$/);
      expect(published?.dominantColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(published?.assets?.wallpapers.desktop).toMatchObject({ w: 2560, h: 1440 });
      expect(storage.objects.size).toBe(7);
      expect(storage.maxActive).toBeLessThanOrEqual(4);
      for (const put of storage.puts) {
        expect(put.cacheControl).toBe('public, max-age=31536000, immutable');
        expect(put.key).toMatch(new RegExp(`^themes/${row.id}/v1/[0-9a-f-]{36}/`));
      }
      if (!published?.assets) throw new Error('Published assets missing');
      const thumb = storage.objects.get(published.assets.thumb);
      const phone = storage.objects.get(published.assets.wallpapers.phone?.key ?? '');
      expect(await sharp(thumb?.body).metadata()).toMatchObject({
        width: 360,
        height: 780,
        format: 'webp',
      });
      expect(await sharp(phone?.body).metadata()).toMatchObject({
        width: 1320,
        height: 2868,
        format: 'jpeg',
        chromaSubsampling: '4:4:4',
      });
      expect(phone?.body.byteLength).toBeLessThanOrEqual(3_000_000);
      const skipped = await publishTheme({ themeId: row.id, actor, storage });
      expect(skipped.data).toEqual({
        assetVersion: 1,
        skipped: true,
      });
      expect(skipped.tags).toEqual(first.tags);
      expect(storage.puts).toHaveLength(7);
      const second = await publishTheme({ themeId: row.id, actor, force: true, storage });
      expect(second.data.assetVersion).toBe(2);
      await cleanupOldVersions(row.id, second.cleanup?.keepFromVersion ?? -1, storage);
      expect(storage.objects.size).toBe(14);
      const third = await publishTheme({ themeId: row.id, actor, force: true, storage });
      expect(third.data.assetVersion).toBe(3);
      const cleanupRetry = await publishTheme({ themeId: row.id, actor, storage });
      expect(cleanupRetry.data).toEqual({ assetVersion: 3, skipped: true });
      expect(cleanupRetry.cleanup).toEqual({ themeId: row.id, keepFromVersion: 2 });
      await cleanupOldVersions(row.id, cleanupRetry.cleanup?.keepFromVersion ?? -1, storage);
      expect(storage.objects.size).toBe(14);
      expect(
        [...storage.objects.keys()].some((key) =>
          key.startsWith(keys.themeVersionPrefix(row.id, 1)),
        ),
      ).toBe(false);
      expect(storage.deletes.map(({ prefix }) => prefix)).toEqual([
        keys.themeVersionPrefix(row.id, 1),
      ]);
      expect((await theme(row.id))?.publishedAt).toEqual(published.publishedAt);
      expect(
        (await audits(row.id)).filter((entry) => entry.action === 'theme.published'),
      ).toHaveLength(3);
      // An over-eager or stale cleanup request must still retain the current and previous versions.
      await cleanupOldVersions(row.id, 1000, storage);
      expect(storage.objects.size).toBe(14);
    }, 90_000);

    it('allows one concurrent winner and cleans only the losing attempt after all uploads settle', async () => {
      const row = await createTheme();
      const storage = new MemoryStorage();
      const barrier = deferred();
      const attempts = new Set<string>();
      storage.onPut = async ({ key }) => {
        attempts.add(key.slice(0, key.lastIndexOf('/') + 1));
        if (attempts.size === 2) barrier.resolve();
        await barrier.promise;
      };
      const outcomes = await Promise.allSettled([
        publishTheme({ themeId: row.id, actor, storage }),
        publishTheme({ themeId: row.id, actor, storage }),
      ]);
      expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      const failure = outcomes.find((outcome) => outcome.status === 'rejected');
      expect(failure?.status === 'rejected' ? (failure.reason as unknown) : null).toMatchObject({
        code: 'CONFLICT',
      });
      const current = await theme(row.id);
      expect(current?.assetVersion).toBe(1);
      expect(storage.objects.size).toBe(7);
      expect(storage.deletes).toHaveLength(1);
      expect(storage.deletes[0]?.active).toBe(0);
      const retained = current?.assets?.thumb;
      expect(retained && storage.objects.has(retained)).toBe(true);
      expect(retained?.startsWith(storage.deletes[0]?.prefix ?? '')).toBe(false);
      expect(await audits(row.id)).toHaveLength(1);
    }, 90_000);

    it('drains in-flight uploads, sanitizes failure data, and preserves an unrelated attempt', async () => {
      const row = await createTheme();
      const storage = new MemoryStorage();
      const foreignPrefix = keys.themeAttemptPrefix(row.id, 1, randomUUID());
      const foreignKey = `${foreignPrefix}thumb.webp`;
      storage.objects.set(foreignKey, {
        body: new Uint8Array([1]),
        contentType: 'image/webp',
        cacheControl: 'immutable',
      });
      const entered = deferred();
      const drain = deferred();
      let count = 0;
      storage.onPut = async () => {
        const first = ++count === 1;
        if (count === 4) entered.resolve();
        await entered.promise;
        if (first) throw new Error('provider leaked https://user:secret@host');
        await drain.promise;
      };
      const pending = publishTheme({ themeId: row.id, actor, storage });
      await entered.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(storage.deletes).toHaveLength(0);
      drain.resolve();
      await expect(pending).rejects.toMatchObject({ code: 'RENDER_FAILED' });
      expect(storage.maxActive).toBe(4);
      expect(storage.puts).toHaveLength(4);
      expect(storage.deletes[0]?.active).toBe(0);
      expect(storage.deletes[0]?.prefix).not.toBe(foreignPrefix);
      expect([...storage.objects.keys()]).toEqual([foreignKey]);
      expect(await theme(row.id)).toMatchObject({
        assetVersion: 0,
        status: 'approved',
        publishError: 'Asset upload failed.',
      });
      const logged = await audits(row.id);
      expect(logged).toHaveLength(1);
      expect(logged[0]).toMatchObject({
        action: 'theme.publish_failed',
        meta: { phase: 'upload', stale: false },
      });
      expect(JSON.stringify(logged)).not.toContain('secret');
    }, 90_000);

    it('does not overwrite newer state when a rendering attempt fails after a spec edit', async () => {
      const row = await createTheme();
      const storage = new MemoryStorage();
      const changed = spec();
      changed.wallpaper = {
        kind: 'waves',
        seed: 51,
        grain: 0,
        colors: null,
        layers: 3,
        amplitude: 0.5,
        frequency: 0.5,
      };
      let mutation: Promise<unknown> | undefined;
      storage.onPut = async () => {
        mutation ??= database
          .update(themes)
          .set({ spec: changed, specHash: await specHash(changed), publishError: 'Newer marker' })
          .where(eq(themes.id, row.id));
        await mutation;
        throw new Error('Storage failed');
      };
      await expect(publishTheme({ themeId: row.id, actor, storage })).rejects.toMatchObject({
        code: 'RENDER_FAILED',
      });
      expect((await theme(row.id))?.publishError).toBe('Newer marker');
      expect((await audits(row.id))[0]).toMatchObject({
        action: 'theme.publish_failed',
        meta: { stale: true },
      });
    }, 90_000);

    it.each(['status', 'specHash'] as const)(
      'detects a final %s race without publishing or writing a failure audit',
      async (field) => {
        const row = await createTheme();
        const storage = new MemoryStorage();
        let edit: Promise<void> | undefined;
        storage.onPut = async () => {
          edit ??= (async () => {
            if (field === 'status')
              await database
                .update(themes)
                .set({ status: 'rejected' })
                .where(eq(themes.id, row.id));
            else {
              const changed = spec();
              changed.wallpaper = {
                kind: 'waves',
                seed: 991,
                grain: 0,
                colors: null,
                layers: 3,
                amplitude: 0.5,
                frequency: 0.5,
              };
              await database
                .update(themes)
                .set({ spec: changed, specHash: await specHash(changed) })
                .where(eq(themes.id, row.id));
            }
          })();
          await edit;
        };
        await expect(publishTheme({ themeId: row.id, actor, storage })).rejects.toMatchObject({
          code: 'CONFLICT',
        });
        expect((await theme(row.id))?.assetVersion).toBe(0);
        expect(storage.objects.size).toBe(0);
        expect(storage.deletes).toHaveLength(1);
        expect(await audits(row.id)).toHaveLength(0);
      },
      90_000,
    );

    it('renders archived republications and stale published specs without requiring force', async () => {
      const row = await createTheme();
      const storage = new MemoryStorage();
      await publishTheme({ themeId: row.id, actor, storage });
      const publishedAt = (await theme(row.id))?.publishedAt;
      const { transitionThemeStatus } = await import('../../server/services/theme-status');
      await transitionThemeStatus({ themeId: row.id, to: 'archived', actor });
      expect((await publishTheme({ themeId: row.id, actor, storage })).data).toEqual({
        assetVersion: 2,
        skipped: false,
      });
      const changed = spec();
      changed.wallpaper = {
        kind: 'waves',
        seed: 2301,
        grain: 0,
        colors: null,
        layers: 3,
        amplitude: 0.5,
        frequency: 0.5,
      };
      const hash = await specHash(changed);
      await database
        .update(themes)
        .set({ spec: changed, specHash: hash })
        .where(eq(themes.id, row.id));
      const stale = await publishTheme({ themeId: row.id, actor, storage });
      expect(stale.data).toEqual({ assetVersion: 3, skipped: false });
      expect(await theme(row.id)).toMatchObject({ assetsSpecHash: hash, publishedAt });
      expect(
        (await audits(row.id)).filter(({ action }) => action === 'theme.published'),
      ).toHaveLength(3);
    }, 90_000);

    it.each([true, false])(
      'loads home/lock photos independently and skips desktop only for image home=%s',
      async (imageHome) => {
        const value = spec();
        const homeKey = keys.wallpaperUploadKeys(randomUUID()).full;
        const lockKey = keys.wallpaperUploadKeys(randomUUID()).full;
        if (imageHome) {
          value.wallpaper = { kind: 'image', assetKey: homeKey, focalX: 0.5, focalY: 0.5, dim: 0 };
          value.icons.fill = 'wallpaper';
        }
        value.lockWallpaper = {
          kind: 'image',
          assetKey: lockKey,
          focalX: 0.5,
          focalY: 0.5,
          dim: 0,
        };
        const row = await createTheme(value);
        const storage = new MemoryStorage();
        for (const [key, color] of [
          [homeKey, '#ff0000'],
          [lockKey, '#0000ff'],
        ]) {
          if (!key || !color) throw new Error('Photo fixture is missing');
          storage.objects.set(key, {
            body: await sharp({
              create: { width: 128, height: 256, channels: 3, background: color },
            })
              .jpeg()
              .toBuffer(),
            contentType: 'image/jpeg',
            cacheControl: 'immutable',
          });
        }
        await publishTheme({ themeId: row.id, actor, storage });
        const assets = (await theme(row.id))?.assets;
        expect(!!assets?.wallpapers.desktop).toBe(!imageHome);
        expect(storage.puts).toHaveLength(imageHome ? 6 : 7);
        expect(storage.gets.sort()).toEqual((imageHome ? [homeKey, lockKey] : [lockKey]).sort());
        const sample = async (key: string | undefined): Promise<number[]> => {
          const bytes = key && storage.objects.get(key)?.body;
          if (!bytes) throw new Error('Preview missing');
          const { data, info } = await sharp(bytes)
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          return [
            ...data.subarray((1250 * info.width + 360) * 3, (1250 * info.width + 360) * 3 + 3),
          ];
        };
        expect((await sample(assets?.previewLock))[2]).toBeGreaterThan(240);
        expect((await sample(assets?.previewLock))[0]).toBeLessThan(15);
        if (imageHome) {
          expect((await sample(assets?.previewHome))[0]).toBeGreaterThan(240);
          expect((await sample(assets?.previewHome))[2]).toBeLessThan(15);
        }
      },
      90_000,
    );

    it('preserves committed files and avoids a false failure audit after a lost COMMIT acknowledgement', async () => {
      const row = await createTheme();
      const storage = new MemoryStorage();
      const transaction = transactionDatabase.transaction.bind(transactionDatabase);
      vi.spyOn(transactionDatabase, 'transaction').mockImplementationOnce(
        async (callback, config) => {
          await transaction(callback, config);
          throw new Error('Simulated lost acknowledgement');
        },
      );
      await expect(publishTheme({ themeId: row.id, actor, storage })).rejects.toMatchObject({
        code: 'INTERNAL',
      });
      expect(await theme(row.id)).toMatchObject({
        assetVersion: 1,
        status: 'published',
        publishError: null,
      });
      expect(storage.objects.size).toBe(7);
      expect(storage.deletes).toHaveLength(0);
      expect((await audits(row.id)).map(({ action }) => action)).toEqual(['theme.published']);
      const retry = await publishTheme({ themeId: row.id, actor, storage });
      expect(retry.data).toEqual({ assetVersion: 1, skipped: true });
      expect(retry.tags).toEqual(
        expect.arrayContaining(['themes', `theme:${row.slug}`, 'collections']),
      );
      expect(storage.puts).toHaveLength(7);
    }, 90_000);

    it('canonicalizes uppercase theme UUIDs for audit identity, assets, and recovery', async () => {
      const row = await createTheme();
      const storage = new MemoryStorage();
      const upper = row.id.toUpperCase();
      const published = await publishTheme({ themeId: upper, actor, storage });
      expect(published.cleanup?.themeId).toBe(row.id);
      const entries = await audits(row.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ entityId: row.id, action: 'theme.published' });
      expect(storage.puts.every(({ key }) => key.startsWith(keys.themePrefix(row.id)))).toBe(true);
      expect((await publishTheme({ themeId: upper, actor, storage })).data).toEqual({
        assetVersion: 1,
        skipped: true,
      });
      await expect(publishTheme({ themeId: `${row.id}\n`, actor, storage })).rejects.toMatchObject({
        code: 'VALIDATION',
      });
      expect(storage.puts).toHaveLength(7);
    }, 90_000);

    it('rejects non-admin actors and invalid states before rendering or uploading', async () => {
      const row = await createTheme(spec(), 'draft');
      const storage = new MemoryStorage();
      await expect(
        publishTheme({
          themeId: row.id,
          actor: { kind: 'user', userId: 'unprivileged', role: 'user', isCreator: false },
          storage,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(publishTheme({ themeId: row.id, actor, storage })).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
      await expect(publishTheme({ themeId: randomUUID(), actor, storage })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(storage.puts).toHaveLength(0);
      expect(await audits(row.id)).toHaveLength(0);
    });
  },
);
