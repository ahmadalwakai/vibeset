import { randomUUID, createHash } from 'node:crypto';
import { neon, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless';
import { eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { user } from '../../db/schema/auth';
import { creatorProfiles } from '../../db/schema/moderation';
import { uploads, auditLog } from '../../db/schema/system';
import type { Actor } from '../../lib/theme-status';
import { MAX_UPLOAD_BYTES } from '../../lib/uploads';
import type { ObjectStorage, StoragePutInput } from '../../lib/validation/storage';
import type * as UploadsService from '../../server/services/uploads';

vi.mock('server-only', () => ({}));
const holder = vi.hoisted(() => ({ pooled: undefined as unknown, features: true }));
vi.mock('../../db/pool', () => ({
  get dbPool(): unknown {
    if (!holder.pooled) throw new Error('Isolated upload pool not ready');
    return holder.pooled;
  },
}));
vi.mock('../../server/services/settings', () => ({
  getFeatures: async () => ({ uploadsEnabled: holder.features }),
}));
vi.mock('../../lib/env.client', () => ({
  env: { NEXT_PUBLIC_CDN_URL: 'https://cdn.example.invalid' },
}));
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const token = randomUUID(),
  people = ['creator', 'admin', 'ordinary', 'banned'].map((role) => `p12-${role}-${token}`);
const [owner = '', admin = '', ordinary = '', banned = ''] = people;
const actor = (id = owner): Actor => ({
  kind: 'user',
  userId: id,
  role: id === admin ? 'admin' : 'user',
  isCreator: false,
});
const ids = new Set<string>();

function storage(): ObjectStorage & {
  objects: Map<string, Uint8Array>;
  puts: StoragePutInput[];
  heads: number;
  gets: number;
  deletes: string[];
  failGet: boolean;
  failPut: boolean;
  oversized: boolean;
} {
  const result = {
    objects: new Map<string, Uint8Array>(),
    puts: [] as StoragePutInput[],
    heads: 0,
    gets: 0,
    deletes: [] as string[],
    failGet: false,
    failPut: false,
    oversized: false,
    async put(input: StoragePutInput): Promise<void> {
      if (result.failPut) throw new Error('private storage failure');
      result.puts.push(input);
      result.objects.set(input.key, new Uint8Array(input.body));
    },
    async head(key: string) {
      result.heads += 1;
      const body = result.objects.get(key);
      return body ? { bytes: body.byteLength } : null;
    },
    async getBytes(key: string): Promise<Uint8Array> {
      result.gets += 1;
      if (result.failGet) throw new Error('private transport');
      if (result.oversized) return new Uint8Array(MAX_UPLOAD_BYTES + 1);
      const body = result.objects.get(key);
      if (!body) throw new Error('Missing fixture object');
      return body;
    },
    async deleteMany(keys: readonly string[]): Promise<void> {
      for (const key of keys) {
        result.deletes.push(key);
        result.objects.delete(key);
      }
    },
    async deletePrefix(): Promise<void> {
      throw new Error('Not used');
    },
    async listPrefixes(): Promise<string[]> {
      return [];
    },
    async presignPut(input: {
      key: string;
      contentType: string;
      expiresIn?: number;
    }): Promise<string> {
      expect(input.expiresIn).toBe(300);
      return `https://signed.example.invalid/${input.key}?signature=fixture`;
    },
  };
  return result;
}

describe.skipIf(!TEST_DATABASE_URL)(
  'upload ownership, normalization and serialized finalization on isolated Neon',
  () => {
    let database: ReturnType<typeof drizzle>,
      pool: Pool | undefined,
      pooled: ReturnType<typeof drizzlePool>,
      service: typeof UploadsService,
      photo: Buffer,
      avatar: Buffer;
    beforeAll(async () => {
      const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
      database = drizzle({ client: neon(url) });
      pool = new Pool({ connectionString: url, max: 5 });
      pooled = drizzlePool({ client: pool });
      holder.pooled = pooled;
      service = await import('../../server/services/uploads');
      await database.insert(user).values(
        people.map((id) => ({
          id,
          name: 'Disposable upload fixture',
          email: `${id}@example.invalid`,
          role: id === admin ? 'admin' : 'user',
          banned: id === banned,
        })),
      );
      await database.insert(creatorProfiles).values({
        userId: owner,
        handle: `u${token.replaceAll('-', '').slice(0, 18)}`,
        displayName: 'Disposable upload creator',
        status: 'approved',
        isAdult: true,
      });
      photo = await sharp({
        create: { width: 1080, height: 1920, channels: 3, background: '#aa44cc' },
      })
        .withMetadata({ exif: { IFD0: { Artist: 'Private fixture' } } })
        .jpeg()
        .toBuffer();
      avatar = await sharp({
        create: { width: 600, height: 300, channels: 3, background: '#22aacc' },
      })
        .png()
        .toBuffer();
    });
    afterAll(async () => {
      try {
        if (database) {
          if (ids.size) {
            await database.delete(auditLog).where(inArray(auditLog.entityId, [...ids]));
            await database.delete(uploads).where(inArray(uploads.id, [...ids]));
          }
          await database.delete(user).where(inArray(user.id, people));
        }
      } finally {
        await pool?.end();
        holder.pooled = undefined;
      }
    });
    async function reserve(
      store: ReturnType<typeof storage>,
      kind: 'wallpaper' | 'avatar' = 'wallpaper',
      body: Uint8Array = kind === 'wallpaper' ? photo : avatar,
    ): Promise<{ id: string; key: string }> {
      const fn = kind === 'wallpaper' ? service.createWallpaperUpload : service.createAvatarUpload;
      const result = await fn(
        { contentType: kind === 'wallpaper' ? 'image/jpeg' : 'image/png', bytes: body.byteLength },
        actor(),
        store,
      );
      ids.add(result.data.uploadId);
      const key = `uploads/incoming/${owner}/${kind === 'avatar' ? 'avatars/' : ''}${result.data.uploadId}`;
      store.objects.set(key, body);
      expect(result.data.headers['Content-Type']).toBe(
        kind === 'wallpaper' ? 'image/jpeg' : 'image/png',
      );
      return { id: result.data.uploadId, key };
    }
    async function row(id: string) {
      return (await database.select().from(uploads).where(eq(uploads.id, id)))[0];
    }
    it('normalizes a wallpaper, strips metadata, stores processed bytes and makes ready retries idempotent', async () => {
      const store = storage(),
        upload = await reserve(store);
      const result = await service.finalizeWallpaperUpload({ uploadId: upload.id }, actor(), store);
      expect(result.data).toMatchObject({
        assetKey: `uploads/wallpapers/${upload.id}/full.jpg`,
        width: 1080,
        height: 1920,
      });
      expect(result.data.palette.length).toBeGreaterThan(0);
      expect(store.puts).toHaveLength(2);
      expect(store.objects.has(upload.key)).toBe(false);
      const full = store.objects.get(result.data.assetKey);
      if (!full) throw new Error('Missing normalized fixture');
      expect((await sharp(full).metadata()).exif).toBeUndefined();
      expect(await row(upload.id)).toMatchObject({ status: 'ready', bytes: full.byteLength });
      expect(
        (await service.finalizeWallpaperUpload({ uploadId: upload.id }, actor(), store)).data,
      ).toEqual(result.data);
      expect(store.gets).toBe(1);
      expect(store.puts).toHaveLength(2);
    });
    it('proves avatar purpose by incoming/final namespaces and hashes normalized256square bytes', async () => {
      const store = storage(),
        upload = await reserve(store, 'avatar');
      await expect(
        service.finalizeWallpaperUpload({ uploadId: upload.id }, actor(), store),
      ).rejects.toMatchObject({ code: 'UPLOAD_INVALID' });
      expect((await row(upload.id))?.status).toBe('pending');
      await expect(
        service.finalizeAvatarUpload({ uploadId: upload.id }, actor(admin), store),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const result = await service.finalizeAvatarUpload({ uploadId: upload.id }, actor(), store);
      const body = store.objects.get(result.data.assetKey);
      if (!body) throw new Error('Missing avatar fixture');
      expect(result.data.assetKey).toBe(
        `avatars/${owner}/${createHash('sha256').update(body).digest('hex')}.webp`,
      );
      expect([result.data.width, result.data.height]).toEqual([256, 256]);
      expect((await sharp(body).metadata()).format).toBe('webp');
      expect(store.puts).toHaveLength(1);
    });
    it('commits bad content rejection before returning UPLOAD_INVALID and cleans raw data only afterward', async () => {
      const store = storage(),
        upload = await reserve(store, 'wallpaper', new Uint8Array([255, 216, 255, 0]));
      await expect(
        service.finalizeWallpaperUpload({ uploadId: upload.id }, actor(), store),
      ).rejects.toMatchObject({ code: 'UPLOAD_INVALID', fieldErrors: { reason: ['unsupported'] } });
      expect(await row(upload.id)).toMatchObject({
        status: 'rejected',
        rejectionReason: 'unsupported',
      });
      expect(store.objects.has(upload.key)).toBe(false);
      expect(store.puts).toEqual([]);
      const reads = store.gets;
      await expect(
        service.finalizeWallpaperUpload({ uploadId: upload.id }, actor(), store),
      ).rejects.toMatchObject({ code: 'UPLOAD_INVALID' });
      expect(store.gets).toBe(reads);
    });
    it('rejects expired or actualoversized bodies without decoding or writing finals', async () => {
      const store = storage(),
        expired = await reserve(store);
      await database
        .update(uploads)
        .set({ createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000) })
        .where(eq(uploads.id, expired.id));
      await expect(
        service.finalizeWallpaperUpload({ uploadId: expired.id }, actor(), store),
      ).rejects.toMatchObject({ fieldErrors: { reason: ['expired'] } });
      expect(store.gets).toBe(0);
      const large = await reserve(store);
      store.oversized = true;
      await expect(
        service.finalizeWallpaperUpload({ uploadId: large.id }, actor(), store),
      ).rejects.toMatchObject({ fieldErrors: { reason: ['too_large'] } });
      expect((await row(large.id))?.status).toBe('rejected');
      expect(store.puts).toEqual([]);
    });
    it('leaves transport/partial-write failures pending and supports retry without deleting possibly referenced objects', async () => {
      const store = storage(),
        upload = await reserve(store);
      store.failGet = true;
      await expect(
        service.finalizeWallpaperUpload({ uploadId: upload.id }, actor(), store),
      ).rejects.toMatchObject({ code: 'INTERNAL' });
      expect((await row(upload.id))?.status).toBe('pending');
      expect(store.objects.has(upload.key)).toBe(true);
      expect(store.deletes).toEqual([]);
      store.failGet = false;
      store.failPut = true;
      await expect(
        service.finalizeWallpaperUpload({ uploadId: upload.id }, actor(), store),
      ).rejects.toMatchObject({ code: 'INTERNAL' });
      expect((await row(upload.id))?.status).toBe('pending');
      store.failPut = false;
      expect(
        (await service.finalizeWallpaperUpload({ uploadId: upload.id }, actor(), store)).data
          .uploadId,
      ).toBe(upload.id);
    });
    it('serializes concurrent finalizers before I/O so only one reads and writes immutable keys', async () => {
      const store = storage(),
        upload = await reserve(store);
      const settled = await Promise.allSettled([
        service.finalizeWallpaperUpload({ uploadId: upload.id }, actor(), store),
        service.finalizeWallpaperUpload({ uploadId: upload.id }, actor(), store),
      ]);
      expect(settled.every((value) => value.status === 'fulfilled')).toBe(true);
      expect(store.gets).toBe(1);
      expect(store.puts).toHaveLength(2);
    }, 20_000);
    it('preserves finals and raw input when the commit acknowledgement is uncertain', async () => {
      const store = storage(),
        upload = await reserve(store);
      const original = pooled.transaction.bind(pooled);
      const spy = vi
        .spyOn(pooled, 'transaction')
        .mockImplementationOnce(async (callback, config) => {
          await original(callback, config);
          throw new Error('Lost commit acknowledgement');
        });
      try {
        await expect(
          service.finalizeWallpaperUpload({ uploadId: upload.id }, actor(), store),
        ).rejects.toMatchObject({ code: 'INTERNAL' });
      } finally {
        spy.mockRestore();
      }
      expect((await row(upload.id))?.status).toBe('ready');
      expect(store.puts).toHaveLength(2);
      expect(store.deletes).toEqual([]);
      expect(store.objects.has(upload.key)).toBe(true);
      expect(
        (await service.finalizeWallpaperUpload({ uploadId: upload.id }, actor(), store)).data
          .uploadId,
      ).toBe(upload.id);
      expect(store.puts).toHaveLength(2);
    });
    it('rechecks creator/admin/ban/feature permissions before reservations or finalization', async () => {
      const store = storage();
      for (const id of [ordinary, banned])
        await expect(
          service.createAvatarUpload(
            { contentType: 'image/png', bytes: avatar.length },
            actor(id),
            store,
          ),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      const permitted = await service.createAvatarUpload(
        { contentType: 'image/png', bytes: avatar.length },
        actor(admin),
        store,
      );
      ids.add(permitted.data.uploadId);
      holder.features = false;
      try {
        await expect(
          service.createAvatarUpload(
            { contentType: 'image/png', bytes: avatar.length },
            actor(admin),
            store,
          ),
        ).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
      } finally {
        holder.features = true;
      }
    });
  },
);
