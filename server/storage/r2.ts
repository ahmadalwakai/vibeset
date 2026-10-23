import 'server-only';

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { storageKeySchema, storagePrefixSchema } from '../../lib/validation/storage';
import type { ObjectStorage, StorageHead } from '../../lib/validation/storage';
export type {
  ObjectStorage,
  StorageHead,
  StoragePutInput,
  PresignPutInput,
} from '../../lib/validation/storage';

const MAX_OBJECT_BYTES = 32 * 1024 * 1024;
const MAX_PAGES = 10_000;
const mime = z
  .string()
  .max(127)
  .regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i)
  .refine((value) => !/\s/.test(value));
const header = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !/[^\x20-\x7e]/.test(value));
const configSchema = z.strictObject({
  accountId: z
    .string()
    .length(32)
    .regex(/^[a-f0-9]{32}$/i),
  accessKeyId: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[a-z0-9]+$/i)
    .refine((value) => !/\s/.test(value)),
  secretAccessKey: z
    .string()
    .min(1)
    .max(512)
    .refine((value) => !/\s/.test(value)),
  bucket: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/)
    .refine((value) => !/[^a-z0-9.-]/.test(value))
    .refine((value) => !/\.\.|\.-|-\./.test(value)),
});
export type R2StorageConfig = z.infer<typeof configSchema>;
const putSchema = z.strictObject({
  key: storageKeySchema,
  body: z
    .instanceof(Uint8Array)
    .refine((bytes) => bytes.byteLength <= MAX_OBJECT_BYTES, 'Object is too large'),
  contentType: mime,
  cacheControl: header,
});
const presignSchema = z.strictObject({
  key: storageKeySchema,
  contentType: mime,
  expiresIn: z.number().int().min(1).max(3600).default(300),
});
const listingSchema = z.object({
  Contents: z
    .array(z.object({ Key: storageKeySchema }))
    .max(1000)
    .default([]),
  CommonPrefixes: z
    .array(z.object({ Prefix: storagePrefixSchema }))
    .max(1000)
    .default([]),
  IsTruncated: z.boolean().default(false),
  NextContinuationToken: z.string().min(1).max(4096).optional(),
});

async function request<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    // SDK errors can contain request details; expose only an operation-independent failure.
    throw new Error('Object storage request failed');
  }
}

export function createR2Storage(configuration: R2StorageConfig): ObjectStorage {
  const parsed = configSchema.safeParse(configuration);
  if (!parsed.success)
    throw new Error(
      'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET must be configured correctly',
    );
  const config = parsed.data;
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  const storage: ObjectStorage = {
    async put(input): Promise<void> {
      const value = putSchema.parse(input);
      await request(() =>
        client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: value.key,
            Body: value.body,
            ContentType: value.contentType,
            CacheControl: value.cacheControl,
          }),
        ),
      );
    },
    async head(key): Promise<StorageHead | null> {
      const validKey = storageKeySchema.parse(key);
      try {
        const output = await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: validKey }),
        );
        return z
          .object({
            bytes: z.number().int().nonnegative(),
            contentType: mime.optional(),
            etag: header.optional(),
          })
          .parse({
            bytes: output.ContentLength,
            contentType: output.ContentType,
            etag: output.ETag,
          });
      } catch (error) {
        if (
          error instanceof NotFound ||
          (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)
        )
          return null;
        throw new Error('Object metadata request failed');
      }
    },
    async getBytes(key): Promise<Uint8Array> {
      const validKey = storageKeySchema.parse(key);
      const output = await request(() =>
        client.send(new GetObjectCommand({ Bucket: config.bucket, Key: validKey })),
      );
      if (!output.Body) throw new Error('Object body is unavailable');
      const responseBody = output.Body;
      let reader: ReadableStreamDefaultReader<unknown> | undefined;
      const chunks: Uint8Array[] = [];
      let total = 0;
      let oversized = false;
      try {
        reader = responseBody.transformToWebStream().getReader();
        if (
          output.ContentLength !== undefined &&
          (!Number.isSafeInteger(output.ContentLength) ||
            output.ContentLength < 0 ||
            output.ContentLength > MAX_OBJECT_BYTES)
        ) {
          oversized = true;
          throw new RangeError('Object is too large');
        }
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          const chunk = z.instanceof(Uint8Array).parse(next.value);
          total += chunk.byteLength;
          if (total > MAX_OBJECT_BYTES) {
            oversized = true;
            throw new RangeError('Object is too large');
          }
          chunks.push(chunk);
        }
      } catch {
        if (reader) await reader.cancel().catch((): void => {});
        else if ('destroy' in responseBody && typeof responseBody.destroy === 'function') {
          try {
            responseBody.destroy();
          } catch {
            /* Best-effort release after stream conversion fails. */
          }
        }
        if (oversized) throw new RangeError('Object is too large');
        throw new Error('Object download failed');
      } finally {
        try {
          reader?.releaseLock();
        } catch {
          /* Never expose provider cleanup errors. */
        }
      }
      if (output.ContentLength !== undefined && output.ContentLength !== total)
        throw new Error('Object length does not match its metadata');
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    },
    async deleteMany(keys): Promise<void> {
      const validKeys = [...new Set(z.array(storageKeySchema).max(100_000).parse(keys))];
      for (let i = 0; i < validKeys.length; i += 1000) {
        const output = await request(() =>
          client.send(
            new DeleteObjectsCommand({
              Bucket: config.bucket,
              Delete: {
                Objects: validKeys.slice(i, i + 1000).map((Key) => ({ Key })),
                Quiet: true,
              },
            }),
          ),
        );
        if (output.Errors?.length)
          throw new Error(`Object deletion failed for ${output.Errors.length} object(s)`);
      }
    },
    async deletePrefix(prefix): Promise<void> {
      const validPrefix = storagePrefixSchema.parse(prefix);
      const seen = new Set<string>();
      // Drain the first remaining page: deleting entries before reusing an opaque
      // continuation token can otherwise skip objects as a listing shrinks.
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const output = listingSchema.parse(
          await request(() =>
            client.send(
              new ListObjectsV2Command({
                Bucket: config.bucket,
                Prefix: validPrefix,
                MaxKeys: 1000,
              }),
            ),
          ),
        );
        const keys = output.Contents.map(({ Key }) => Key);
        if (keys.some((key) => !key.startsWith(validPrefix)))
          throw new Error('Storage listing escaped the requested prefix');
        if (keys.length === 0) {
          if (output.IsTruncated) throw new Error('Storage listing made no progress');
          return;
        }
        const first = keys[0] as string;
        if (seen.has(first)) throw new Error('Storage deletion made no progress');
        seen.add(first);
        await storage.deleteMany(keys);
      }
      throw new Error('Storage deletion exceeded its page limit');
    },
    async listPrefixes(prefix): Promise<string[]> {
      const validPrefix = storagePrefixSchema.parse(prefix);
      const prefixes = new Set<string>();
      const tokens = new Set<string>();
      let continuation: string | undefined;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const output = listingSchema.parse(
          await request(() =>
            client.send(
              new ListObjectsV2Command({
                Bucket: config.bucket,
                Prefix: validPrefix,
                Delimiter: '/',
                MaxKeys: 1000,
                ContinuationToken: continuation,
              }),
            ),
          ),
        );
        for (const { Prefix } of output.CommonPrefixes) {
          if (
            !Prefix.startsWith(validPrefix) ||
            !/^[^/]+\/$/.test(Prefix.slice(validPrefix.length))
          )
            throw new Error('Storage listing escaped the requested child prefixes');
          prefixes.add(Prefix);
        }
        if (!output.IsTruncated) return [...prefixes].sort();
        const next = output.NextContinuationToken;
        if (!next || tokens.has(next)) throw new Error('Storage pagination made no progress');
        tokens.add(next);
        continuation = next;
      }
      throw new Error('Storage listing exceeded its page limit');
    },
    async presignPut(input): Promise<string> {
      const value = presignSchema.parse(input);
      return request(() =>
        getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: value.key,
            ContentType: value.contentType,
          }),
          { expiresIn: value.expiresIn, signableHeaders: new Set(['content-type']) },
        ),
      );
    },
  };
  return storage;
}

let defaultStoragePromise: Promise<ObjectStorage> | undefined;
async function configuredStorage(): Promise<ObjectStorage> {
  defaultStoragePromise ??= (async (): Promise<ObjectStorage> => {
    const { env } = await import('../../lib/env.server');
    const parsed = configSchema.safeParse({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
    });
    if (!parsed.success)
      throw new Error(
        'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET must be configured correctly',
      );
    return createR2Storage(parsed.data);
  })().catch((error: unknown): never => {
    defaultStoragePromise = undefined;
    throw error;
  });
  return defaultStoragePromise;
}

export const defaultStorage: ObjectStorage = {
  put: async (input): Promise<void> => (await configuredStorage()).put(input),
  head: async (key): Promise<StorageHead | null> => (await configuredStorage()).head(key),
  getBytes: async (key): Promise<Uint8Array> => (await configuredStorage()).getBytes(key),
  deleteMany: async (keys): Promise<void> => (await configuredStorage()).deleteMany(keys),
  deletePrefix: async (prefix): Promise<void> => (await configuredStorage()).deletePrefix(prefix),
  listPrefixes: async (prefix): Promise<string[]> =>
    (await configuredStorage()).listPrefixes(prefix),
  presignPut: async (input): Promise<string> => (await configuredStorage()).presignPut(input),
};
