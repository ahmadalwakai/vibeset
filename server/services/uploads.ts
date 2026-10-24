import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import type * as PoolModule from '../../db/pool';
import { auditLog, uploads } from '../../db/schema/system';
import { actorSchema, type Actor } from '../../lib/theme-status';
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_PENDING_MS,
  UPLOAD_PRESIGN_SECONDS,
  UploadPreparationError,
} from '../../lib/uploads';
import type {
  FinalizedWallpaperUpload,
  UploadedAsset,
  UploadInvalidReason,
  UploadKind,
  UploadReservation,
} from '../../lib/uploads';
import {
  createUploadSchema,
  finalizeUploadSchema,
  finalizedWallpaperUploadSchema,
  uploadedAssetSchema,
  uploadContentTypeSchema,
  uploadInvalidReasonSchema,
  uploadReservationSchema,
} from '../../lib/validation/uploads';
import type { CreateUploadInput, FinalizeUploadInput } from '../../lib/validation/uploads';
import { AppError } from '../errors';
import {
  avatarKey,
  incomingAvatarUploadKey,
  incomingUploadKey,
  wallpaperUploadKeys,
} from '../storage/keys';
import { defaultStorage } from '../storage/r2';
import type { ObjectStorage } from '../storage/r2';
import { cdnUrl } from '../storage/urls';
import { normalizeUpload } from '../render/upload-image';
import { requireCreatorPrincipal } from './creator-access';
import type { CreatorTransaction } from './creator-access';

type UploadRow = typeof uploads.$inferSelect;
type Mutation<T> = { data: T; tags: string[] };
let poolModule: Promise<typeof PoolModule> | undefined;
const cacheControl = 'public, max-age=31536000, immutable';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError('VALIDATION');
  return parsed.data;
}
function invalid(reason: UploadInvalidReason): AppError {
  return new AppError('UPLOAD_INVALID', 'Invalid upload', { reason: [reason] });
}
async function enabled(): Promise<void> {
  const { getFeatures } = await import('./settings');
  if (!(await getFeatures()).uploadsEnabled) throw new AppError('FEATURE_DISABLED');
}
async function audit(
  tx: CreatorTransaction,
  ownerId: string,
  id: string,
  action: string,
  meta: Record<string, unknown>,
): Promise<void> {
  await tx
    .insert(auditLog)
    .values({ actorId: ownerId, entityType: 'upload', entityId: id, action, meta });
}
function incoming(kind: UploadKind, ownerId: string, id: string): string {
  return kind === 'avatar' ? incomingAvatarUploadKey(ownerId, id) : incomingUploadKey(ownerId, id);
}

async function create(
  raw: CreateUploadInput,
  actor: Actor,
  kind: UploadKind,
  storage: ObjectStorage,
): Promise<Mutation<UploadReservation>> {
  const input = parse(createUploadSchema, raw),
    identity = parse(actorSchema, actor);
  await enabled();
  const { dbPool } = await (poolModule ??= import('../../db/pool'));
  try {
    return await dbPool.transaction(async (tx) => {
      const principal = await requireCreatorPrincipal(tx, identity);
      const id = randomUUID(),
        key = incoming(kind, principal.id, id);
      await tx.insert(uploads).values({
        id,
        ownerId: principal.id,
        incomingKey: key,
        contentType: input.contentType,
        bytes: input.bytes,
      });
      const url = await storage.presignPut({
        key,
        contentType: input.contentType,
        expiresIn: UPLOAD_PRESIGN_SECONDS,
      });
      const data = uploadReservationSchema.parse({
        uploadId: id,
        url,
        headers: { 'Content-Type': input.contentType },
      });
      await audit(tx, principal.id, id, 'upload.created', {
        kind,
        bytes: input.bytes,
        contentType: input.contentType,
      });
      return { data, tags: [] };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('INTERNAL', 'Upload reservation failed');
  }
}

function ready(row: UploadRow, kind: UploadKind): UploadedAsset | FinalizedWallpaperUpload {
  const full = kind === 'wallpaper' ? wallpaperUploadKeys(row.id).full : row.fullKey;
  if (
    !full ||
    full !== row.fullKey ||
    !row.previewKey ||
    (kind === 'wallpaper' && row.previewKey !== wallpaperUploadKeys(row.id).preview) ||
    (kind === 'avatar' && (row.previewKey !== full || row.width !== 256 || row.height !== 256))
  )
    throw new AppError('INTERNAL', 'Invalid persisted upload');
  if (kind === 'avatar' && !new RegExp(`^avatars/${row.ownerId}/[a-f0-9]{64}\\.webp$`).test(full))
    throw new AppError('INTERNAL', 'Invalid avatar key');
  const data = {
    uploadId: row.id,
    assetKey: full,
    previewUrl: cdnUrl(row.previewKey),
    width: row.width,
    height: row.height,
  };
  return kind === 'wallpaper'
    ? finalizedWallpaperUploadSchema.parse({ ...data, palette: row.palette })
    : uploadedAssetSchema.parse(data);
}

async function finalize(
  raw: FinalizeUploadInput,
  actor: Actor,
  kind: UploadKind,
  storage: ObjectStorage,
): Promise<Mutation<UploadedAsset | FinalizedWallpaperUpload>> {
  const input = parse(finalizeUploadSchema, raw),
    identity = parse(actorSchema, actor);
  await enabled();
  const { dbPool } = await (poolModule ??= import('../../db/pool'));
  let result:
    | { ok: true; data: UploadedAsset | FinalizedWallpaperUpload; key: string }
    | { ok: false; reason: UploadInvalidReason; key: string };
  try {
    result = await dbPool.transaction(
      async (tx) => {
        const principal = await requireCreatorPrincipal(tx, identity);
        // Hold this row through I/O: immutable fixed output keys must never be overwritten by a second finalizer.
        const [row] = await tx
          .select()
          .from(uploads)
          .where(and(eq(uploads.id, input.uploadId), eq(uploads.ownerId, principal.id)))
          .for('update');
        if (!row) throw new AppError('NOT_FOUND');
        const key = incoming(kind, principal.id, row.id);
        if (row.incomingKey !== key) throw invalid('unsupported');
        if (row.status === 'ready') return { ok: true as const, data: ready(row, kind), key };
        if (row.status === 'rejected')
          return {
            ok: false as const,
            reason: uploadInvalidReasonSchema.catch('unsupported').parse(row.rejectionReason),
            key,
          };
        const reject = async (
          reason: UploadInvalidReason,
        ): Promise<{ ok: false; reason: UploadInvalidReason; key: string }> => {
          await tx
            .update(uploads)
            .set({ status: 'rejected', rejectionReason: reason })
            .where(eq(uploads.id, row.id));
          await audit(tx, principal.id, row.id, 'upload.rejected', { kind, reason });
          return { ok: false, reason, key };
        };
        if (Date.now() - row.createdAt.getTime() > UPLOAD_PENDING_MS) return reject('expired');
        const head = await storage.head(key);
        if (!head) throw invalid('expired'); // A missing/unfinished PUT remains retryable.
        if (head.bytes <= 0 || head.bytes > MAX_UPLOAD_BYTES) return reject('too_large');
        const contentType = uploadContentTypeSchema.safeParse(row.contentType);
        if (!contentType.success || (head.contentType && head.contentType !== contentType.data))
          return reject('unsupported');
        const bytes = await storage.getBytes(key);
        if (bytes.byteLength > MAX_UPLOAD_BYTES) return reject('too_large');
        if (bytes.byteLength !== head.bytes || bytes.byteLength !== row.bytes)
          return reject('unsupported');
        let image;
        try {
          image = await normalizeUpload(bytes, contentType.data, kind);
        } catch (error) {
          if (error instanceof UploadPreparationError) return reject(error.reason);
          throw error;
        }
        const keys =
          kind === 'wallpaper'
            ? wallpaperUploadKeys(row.id)
            : {
                full: avatarKey(
                  principal.id,
                  createHash('sha256').update(image.full).digest('hex'),
                ),
                preview: '',
              };
        if (kind === 'avatar') keys.preview = keys.full;
        await storage.put({
          key: keys.full,
          body: image.full,
          contentType: kind === 'wallpaper' ? 'image/jpeg' : 'image/webp',
          cacheControl,
        });
        if (kind === 'wallpaper')
          await storage.put({
            key: keys.preview,
            body: image.preview,
            contentType: 'image/webp',
            cacheControl,
          });
        const [updated] = await tx
          .update(uploads)
          .set({
            status: 'ready',
            fullKey: keys.full,
            previewKey: keys.preview,
            contentType: kind === 'wallpaper' ? 'image/jpeg' : 'image/webp',
            bytes: image.full.byteLength,
            width: image.width,
            height: image.height,
            palette: image.palette,
            rejectionReason: null,
          })
          .where(eq(uploads.id, row.id))
          .returning();
        if (!updated) throw new AppError('CONFLICT');
        await audit(tx, principal.id, row.id, 'upload.ready', {
          kind,
          width: image.width,
          height: image.height,
          bytes: image.full.byteLength,
        });
        return { ok: true as const, data: ready(updated, kind), key };
      },
      { isolationLevel: 'read committed' },
    );
  } catch (error) {
    // Commit acknowledgement can be lost. Never delete final objects on this path.
    if (error instanceof AppError) throw error;
    throw new AppError('INTERNAL', 'Upload finalization failed');
  }
  // Only a confirmed ready/rejected commit permits deleting the raw object.
  try {
    await storage.deleteMany([result.key]);
  } catch {
    console.error({ scope: 'upload.cleanup', message: 'Incoming object cleanup failed' });
  }
  if (!result.ok) throw invalid(result.reason);
  return { data: result.data, tags: [] };
}

export async function createWallpaperUpload(
  input: CreateUploadInput,
  actor: Actor,
  storage: ObjectStorage = defaultStorage,
): Promise<Mutation<UploadReservation>> {
  return create(input, actor, 'wallpaper', storage);
}
export async function createAvatarUpload(
  input: CreateUploadInput,
  actor: Actor,
  storage: ObjectStorage = defaultStorage,
): Promise<Mutation<UploadReservation>> {
  return create(input, actor, 'avatar', storage);
}
export async function finalizeWallpaperUpload(
  input: FinalizeUploadInput,
  actor: Actor,
  storage: ObjectStorage = defaultStorage,
): Promise<Mutation<FinalizedWallpaperUpload>> {
  const result = await finalize(input, actor, 'wallpaper', storage);
  return { data: finalizedWallpaperUploadSchema.parse(result.data), tags: result.tags };
}
export async function finalizeAvatarUpload(
  input: FinalizeUploadInput,
  actor: Actor,
  storage: ObjectStorage = defaultStorage,
): Promise<Mutation<UploadedAsset>> {
  const result = await finalize(input, actor, 'avatar', storage);
  return { data: uploadedAssetSchema.parse(result.data), tags: result.tags };
}
