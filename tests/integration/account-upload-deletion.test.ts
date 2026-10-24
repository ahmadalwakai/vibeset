import { randomUUID } from 'node:crypto';
import { neon, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless';
import { eq, inArray, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { user } from '../../db/schema/auth';
import { creatorProfiles } from '../../db/schema/moderation';
import { uploads, auditLog } from '../../db/schema/system';
import type { Actor } from '../../lib/theme-status';
import type { ObjectStorage } from '../../lib/validation/storage';
import type * as AccountService from '../../server/services/account';
import type * as UploadService from '../../server/services/uploads';

vi.mock('server-only', () => ({}));
const holder = vi.hoisted(() => ({ pooled: undefined as unknown }));
vi.mock('../../db/pool', () => ({
  get dbPool(): unknown {
    if (!holder.pooled) throw new Error('Test pool not ready');
    return holder.pooled;
  },
}));
vi.mock('../../server/services/settings', () => ({
  getFeatures: async () => ({ uploadsEnabled: true }),
}));
vi.mock('../../lib/env.client', () => ({
  env: { NEXT_PUBLIC_CDN_URL: 'https://cdn.example.invalid' },
}));
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const token = randomUUID(),
  ownerId = `p12-delete-${token}`,
  applicationName = `p12-delete-${token}`;
const actor: Actor = { kind: 'user', userId: ownerId, role: 'user', isCreator: true };
function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe.skipIf(!TEST_DATABASE_URL)('account deletion serializes upload completion', () => {
  let database: ReturnType<typeof drizzle>,
    pool: Pool | undefined,
    accounts: typeof AccountService,
    uploadService: typeof UploadService;
  const uploadIds = new Set<string>();
  beforeAll(async () => {
    const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
    database = drizzle({ client: neon(url) });
    pool = new Pool({ connectionString: url, max: 5, application_name: applicationName });
    holder.pooled = drizzlePool({ client: pool });
    accounts = await import('../../server/services/account');
    uploadService = await import('../../server/services/uploads');
    await database
      .insert(user)
      .values({
        id: ownerId,
        name: 'Disposable deletion fixture',
        email: `${ownerId}@example.invalid`,
        role: 'user',
      });
    await database
      .insert(creatorProfiles)
      .values({
        userId: ownerId,
        handle: `d${token.replaceAll('-', '').slice(0, 18)}`,
        displayName: 'Disposable creator',
        status: 'approved',
        isAdult: true,
      });
  });
  afterAll(async () => {
    try {
      if (database) {
        if (uploadIds.size)
          await database.delete(auditLog).where(inArray(auditLog.entityId, [...uploadIds]));
        await database.delete(user).where(eq(user.id, ownerId));
      }
    } finally {
      await pool?.end();
      holder.pooled = undefined;
    }
  });
  it('captures keys committed by an in-flight finalizer and rejects all subsequent upload work', async () => {
    const photo = await sharp({
      create: { width: 1080, height: 1920, channels: 3, background: '#704aa0' },
    })
      .jpeg()
      .toBuffer();
    const objects = new Map<string, Uint8Array>(),
      entered = deferred(),
      release = deferred();
    let block = true;
    const storage: ObjectStorage = {
      async put(input) {
        if (block) {
          block = false;
          entered.resolve();
          await release.promise;
        }
        objects.set(input.key, new Uint8Array(input.body));
      },
      async head(key) {
        const body = objects.get(key);
        return body ? { bytes: body.byteLength } : null;
      },
      async getBytes(key) {
        const body = objects.get(key);
        if (!body) throw new Error('Missing test object');
        return body;
      },
      async deleteMany(keys) {
        for (const key of keys) objects.delete(key);
      },
      async deletePrefix() {
        throw new Error('Unused in this test');
      },
      async listPrefixes() {
        return [];
      },
      async presignPut({ key }) {
        return `https://signed.example.invalid/${key}`;
      },
    };
    const reservation = await uploadService.createWallpaperUpload(
        { contentType: 'image/jpeg', bytes: photo.byteLength },
        actor,
        storage,
      ),
      id = reservation.data.uploadId;
    uploadIds.add(id);
    objects.set(`uploads/incoming/${ownerId}/${id}`, photo);
    const finalizing = uploadService.finalizeWallpaperUpload({ uploadId: id }, actor, storage);
    await entered.promise;
    const deleting = accounts.deleteAccountAndContent(ownerId);
    let blocked = false;
    try {
      const until = Date.now() + 5000;
      while (Date.now() < until) {
        const activity = await database.execute<{ waiting: boolean }>(
          sql`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name=${applicationName} AND wait_event_type='Lock' AND query ILIKE '%for update%' AND query LIKE '%"user"%') AS waiting`,
        );
        if (activity.rows[0]?.waiting) {
          blocked = true;
          break;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
      }
    } finally {
      release.resolve();
    }
    const [finalized, plan] = await Promise.all([finalizing, deleting]);
    expect(blocked).toBe(true);
    expect(plan.keys).toEqual(
      expect.arrayContaining([
        finalized.data.assetKey,
        `uploads/wallpapers/${id}/preview.webp`,
        `uploads/incoming/${ownerId}/${id}`,
      ]),
    );
    expect(await database.select({ id: user.id }).from(user).where(eq(user.id, ownerId))).toEqual(
      [],
    );
    expect(
      await database.select({ id: uploads.id }).from(uploads).where(eq(uploads.id, id)),
    ).toEqual([]);
    await expect(
      uploadService.finalizeWallpaperUpload({ uploadId: id }, actor, storage),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(
      uploadService.createWallpaperUpload(
        { contentType: 'image/jpeg', bytes: photo.byteLength },
        actor,
        storage,
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    const retry = await accounts.deleteAccountAndContent(ownerId);
    expect(retry.keys).toEqual([]);
    expect(retry.prefixes).toEqual([]);
  }, 20000);
});
