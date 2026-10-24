import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  storageKeySchema,
  storageUuidSchema,
  storageVersionSchema,
  themeAssetFileSchema,
  type ObjectStorage,
  type StorageHead,
} from '../../lib/validation/storage';
import { themeAssetKey } from './keys';

const MAX_OBJECT_BYTES = 32 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const mimeSchema = z.enum(['image/jpeg', 'image/webp']);
const digestSchema = z
  .string()
  .length(64)
  .regex(/^[a-f0-9]{64}$/);
const fileSchema = z.strictObject({
  key: storageKeySchema,
  sha256: digestSchema,
  bytes: z.number().int().min(1).max(MAX_OBJECT_BYTES),
  contentType: mimeSchema,
});
const publicationSchema = z
  .strictObject({
    themeId: storageUuidSchema,
    specHash: digestSchema,
    assetVersion: storageVersionSchema,
    attemptId: storageUuidSchema,
    files: z.array(fileSchema).length(themeAssetFileSchema.options.length),
  })
  .superRefine((publication, context) => {
    if (
      !storageUuidSchema.safeParse(publication.themeId).success ||
      !storageUuidSchema.safeParse(publication.attemptId).success ||
      !storageVersionSchema.safeParse(publication.assetVersion).success
    )
      return;
    const expected = new Map(
      themeAssetFileSchema.options.map(
        (file) =>
          [
            themeAssetKey(
              publication.themeId,
              publication.assetVersion,
              file,
              publication.attemptId,
            ),
            file.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
          ] as const,
      ),
    );
    const seen = new Set<string>();
    for (const [index, file] of publication.files.entries()) {
      if (seen.has(file.key) || expected.get(file.key) !== file.contentType)
        context.addIssue({
          code: 'custom',
          path: ['files', index],
          message: 'Invalid publication asset set',
        });
      seen.add(file.key);
    }
  });

/** A deliberately bounded operator manifest, never accepted from a public request. */
export const staticPublicationManifestSchema = z
  .strictObject({
    version: z.literal(1),
    origin: z
      .string()
      .max(2048)
      .refine((value) => !/[\s\\]/u.test(value))
      .pipe(z.url({ protocol: /^https$/ }))
      .refine((value) => {
        const url = new URL(value);
        return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
      })
      .transform((value) => new URL(value).origin),
    publications: z.array(publicationSchema).min(1).max(3),
  })
  .superRefine((manifest, context) => {
    if (
      new Set(manifest.publications.map(({ themeId }) => themeId)).size !==
      manifest.publications.length
    )
      context.addIssue({
        code: 'custom',
        path: ['publications'],
        message: 'Publication themes must be unique',
      });
  });

export type StaticPublicationManifest = z.infer<typeof staticPublicationManifestSchema>;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function beforeAbort<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener('abort', abort);
      reject(new Error('Static asset verification timed out'));
    };
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    try {
      void operation().then(
        (value) => {
          signal.removeEventListener('abort', abort);
          if (signal.aborted) abort();
          else resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', abort);
          reject(error);
        },
      );
    } catch (error) {
      signal.removeEventListener('abort', abort);
      reject(error);
    }
  });
}

/** Verifies bytes already deployed at immutable keys; it never creates or deletes objects. */
export function createPrepublishedStaticStorage(input: StaticPublicationManifest): ObjectStorage {
  const manifest = staticPublicationManifestSchema.parse(input);
  const files = new Map(
    manifest.publications.flatMap(({ files: entries }) =>
      entries.map((file) => [file.key, file] as const),
    ),
  );
  const entryFor = (key: string): z.infer<typeof fileSchema> => {
    const entry = files.get(storageKeySchema.parse(key));
    if (!entry) throw new Error('Static asset is outside the prepared publication manifest');
    return entry;
  };
  const read = async (key: string): Promise<Uint8Array> => {
    const entry = entryFor(key);
    const url = new URL(`/${entry.key}`, manifest.origin).href;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await beforeAbort(
        () =>
          fetch(url, {
            method: 'GET',
            credentials: 'omit',
            redirect: 'error',
            cache: 'no-store',
            headers: { Accept: entry.contentType, 'Accept-Encoding': 'identity' },
            signal: controller.signal,
          }),
        controller.signal,
      );
      if (
        !response.ok ||
        response.redirected ||
        (response.url && response.url !== url) ||
        !response.body
      )
        throw new Error('Static asset is unavailable');
      const length = response.headers.get('content-length');
      const encoding = response.headers.get('content-encoding');
      if (
        response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
          entry.contentType ||
        length === null ||
        !/^\d+$/.test(length) ||
        Number(length) !== entry.bytes ||
        (encoding !== null && encoding.toLowerCase() !== 'identity')
      )
        throw new Error('Static asset metadata does not match its manifest');
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const chunk = await beforeAbort(() => {
          if (!reader) throw new Error('Static asset reader is unavailable');
          return reader.read();
        }, controller.signal);
        if (chunk.done) break;
        const bytes = z.instanceof(Uint8Array).parse(chunk.value);
        total += bytes.byteLength;
        if (total > entry.bytes) throw new Error('Static asset exceeds its manifest size');
        chunks.push(bytes);
      }
      const bytes = Buffer.concat(chunks, total);
      if (total !== entry.bytes || sha256(bytes) !== entry.sha256)
        throw new Error('Static asset bytes do not match its manifest');
      return bytes;
    } catch {
      throw new Error('Deployed static asset verification failed');
    } finally {
      clearTimeout(timer);
      controller.abort();
      if (reader) {
        void reader.cancel().catch((): void => {});
        try {
          reader.releaseLock();
        } catch {
          /* Aborting the fetch owns an outstanding read. */
        }
      }
    }
  };
  const unsupported = async (): Promise<never> => {
    throw new Error('Prepublished static storage does not support this operation');
  };
  return {
    async put(input): Promise<void> {
      const entry = entryFor(input.key);
      if (
        !(input.body instanceof Uint8Array) ||
        input.body.byteLength !== entry.bytes ||
        input.contentType !== entry.contentType ||
        input.cacheControl !== IMMUTABLE ||
        sha256(input.body) !== entry.sha256
      )
        throw new Error('Rendered static asset does not match its manifest');
      const deployed = await read(input.key);
      if (!Buffer.from(deployed).equals(input.body))
        throw new Error('Deployed static asset differs from the rendered bytes');
    },
    async head(key): Promise<StorageHead> {
      const entry = entryFor(key);
      await read(key);
      return { bytes: entry.bytes, contentType: entry.contentType };
    },
    getBytes: read,
    deleteMany: unsupported,
    deletePrefix: unsupported,
    listPrefixes: unsupported,
    presignPut: unsupported,
  };
}
