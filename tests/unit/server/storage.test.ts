import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type * as S3Sdk from '@aws-sdk/client-s3';

const mocks = vi.hoisted(() => ({
  send: vi.fn<(command: unknown) => Promise<unknown>>(),
  construct: vi.fn<(configuration: unknown) => void>(),
  sign: vi.fn<(...args: unknown[]) => Promise<string>>(),
  loadEnv: vi.fn<() => void>(),
  env: {
    R2_ACCOUNT_ID: undefined as string | undefined,
    R2_ACCESS_KEY_ID: undefined as string | undefined,
    R2_SECRET_ACCESS_KEY: undefined as string | undefined,
    R2_BUCKET: undefined as string | undefined,
  },
}));
vi.mock('server-only', () => ({}));
vi.mock('@aws-sdk/client-s3', async (original) => {
  const sdk = await original<typeof S3Sdk>();
  return {
    ...sdk,
    S3Client: class {
      send = mocks.send;
      constructor(configuration: unknown) {
        mocks.construct(configuration);
      }
    },
  };
});
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: mocks.sign }));
vi.mock('../../../lib/env.server', () => {
  mocks.loadEnv();
  return { env: mocks.env };
});
import { createR2Storage, defaultStorage } from '../../../server/storage/r2';

const config = {
  accountId: '1'.repeat(32),
  accessKeyId: 'testkey',
  secretAccessKey: 'testsecret',
  bucket: 'vibeset-test',
};
const key = 'themes/test/v1/attempt/thumb.webp';

function body(
  chunks: Uint8Array[],
  cancel?: () => void,
): { transformToWebStream: () => ReadableStream<Uint8Array> } {
  return {
    transformToWebStream: () =>
      new ReadableStream({
        start(controller): void {
          for (const chunk of chunks) controller.enqueue(chunk);
          if (!cancel) controller.close();
        },
        cancel,
      }),
  };
}

beforeEach(() => {
  mocks.send.mockReset();
  mocks.sign.mockReset();
  mocks.construct.mockClear();
});

describe('R2 object storage adapter', () => {
  it('keeps the default adapter lazy and retries configuration after a missing-credential failure', async () => {
    expect(mocks.loadEnv).not.toHaveBeenCalled();
    expect(mocks.construct).not.toHaveBeenCalled();
    await expect(defaultStorage.head(key)).rejects.toThrow('R2_ACCOUNT_ID');
    expect(mocks.construct).not.toHaveBeenCalled();
    Object.assign(mocks.env, {
      R2_ACCOUNT_ID: config.accountId,
      R2_ACCESS_KEY_ID: config.accessKeyId,
      R2_SECRET_ACCESS_KEY: config.secretAccessKey,
      R2_BUCKET: config.bucket,
    });
    mocks.send.mockResolvedValue({ ContentLength: 1 });
    await expect(defaultStorage.head(key)).resolves.toMatchObject({ bytes: 1 });
    expect(mocks.construct).toHaveBeenCalledOnce();
  });
  it('configures R2 checksums correctly and preserves upload metadata', async () => {
    const storage = createR2Storage(config);
    mocks.send.mockResolvedValue({});
    await storage.put({
      key,
      body: new Uint8Array([1, 2]),
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
    });
    expect(mocks.construct).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'auto',
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
    );
    expect(mocks.send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    expect(mocks.send.mock.calls[0]?.[0]).toMatchObject({
      input: {
        Bucket: config.bucket,
        Key: key,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
        Body: new Uint8Array([1, 2]),
      },
    });
  });
  it('returns missing-object null only for 404 and sanitizes provider failures', async () => {
    const storage = createR2Storage(config);
    mocks.send.mockRejectedValueOnce(
      new NotFound({ $metadata: { httpStatusCode: 404 }, message: 'missing' }),
    );
    await expect(storage.head(key)).resolves.toBeNull();
    mocks.send.mockRejectedValueOnce(
      new S3ServiceException({
        name: 'AccessDenied',
        $fault: 'client',
        $metadata: { httpStatusCode: 403 },
        message: 'private-signature',
      }),
    );
    await expect(storage.head(key)).rejects.toThrow('Object metadata request failed');
    mocks.send.mockRejectedValueOnce(new Error('private-signed-url'));
    await expect(storage.getBytes(key)).rejects.toThrow('Object storage request failed');
    expect(mocks.send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
  });
  it('validates head metadata and collects exact binary response bytes', async () => {
    const storage = createR2Storage(config);
    mocks.send.mockResolvedValueOnce({
      ContentLength: 5,
      ContentType: 'image/jpeg',
      ETag: '"etag"',
    });
    await expect(storage.head(key)).resolves.toEqual({
      bytes: 5,
      contentType: 'image/jpeg',
      etag: '"etag"',
    });
    mocks.send.mockResolvedValueOnce({
      ContentLength: 5,
      Body: body([new Uint8Array([0, 1]), new Uint8Array([2, 3, 255])]),
    });
    await expect(storage.getBytes(key)).resolves.toEqual(new Uint8Array([0, 1, 2, 3, 255]));
    expect(mocks.send).toHaveBeenCalledWith(expect.any(GetObjectCommand));
  });
  it('rejects truncated, missing and oversized bodies while cancelling oversized reads', async () => {
    const storage = createR2Storage(config);
    mocks.send.mockResolvedValueOnce({ ContentLength: 2, Body: body([new Uint8Array([1])]) });
    await expect(storage.getBytes(key)).rejects.toThrow('length');
    mocks.send.mockResolvedValueOnce({});
    await expect(storage.getBytes(key)).rejects.toThrow('body');
    const cancel = vi.fn<() => void>();
    mocks.send.mockResolvedValueOnce({
      ContentLength: 32 * 1024 * 1024 + 1,
      Body: body([], cancel),
    });
    await expect(storage.getBytes(key)).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalledOnce();
    const cancelUnknown = vi.fn<() => void>();
    mocks.send.mockResolvedValueOnce({
      Body: body([new Uint8Array(32 * 1024 * 1024), new Uint8Array([1])], cancelUnknown),
    });
    await expect(storage.getBytes(key)).rejects.toThrow('too large');
    expect(cancelUnknown).toHaveBeenCalledOnce();
  });
  it('sanitizes conversion and stream failures and releases available resources', async () => {
    const storage = createR2Storage(config);
    const destroy = vi.fn<() => void>();
    mocks.send.mockResolvedValueOnce({
      Body: {
        transformToWebStream: (): never => {
          throw new Error('private-signed-url');
        },
        destroy,
      },
    });
    await expect(storage.getBytes(key)).rejects.toThrow('Object download failed');
    expect(destroy).toHaveBeenCalledOnce();
    const cancel = vi.fn<() => Promise<void>>().mockResolvedValue();
    const releaseLock = vi.fn<() => void>();
    mocks.send.mockResolvedValueOnce({
      Body: {
        transformToWebStream: () => ({
          getReader: () => ({
            read: async (): Promise<never> => {
              throw new Error('private-token');
            },
            cancel,
            releaseLock,
          }),
        }),
      },
    });
    await expect(storage.getBytes(key)).rejects.toThrow('Object download failed');
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it('batches deletion in groups of 1000, deduplicates and fails partial errors', async () => {
    const storage = createR2Storage(config);
    mocks.send.mockResolvedValue({});
    const keys = Array.from({ length: 1001 }, (_, i) => `themes/test/file-${i}.webp`);
    await storage.deleteMany([...keys, keys[0] as string]);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    const first = mocks.send.mock.calls[0]?.[0];
    const second = mocks.send.mock.calls[1]?.[0];
    expect(first).toBeInstanceOf(DeleteObjectsCommand);
    expect(first).toMatchObject({
      input: { Delete: { Objects: expect.arrayContaining([{ Key: keys[0] }]) } },
    });
    expect(second).toMatchObject({ input: { Delete: { Objects: [{ Key: keys[1000] }] } } });
    mocks.send.mockResolvedValueOnce({
      Errors: [{ Key: key, Code: 'AccessDenied', Message: 'private' }],
    });
    await expect(storage.deleteMany([key])).rejects.toThrow('1 object(s)');
  });
  it('drains changing first pages without skipping objects through shifted continuation tokens', async () => {
    const storage = createR2Storage(config);
    const remaining = new Set(
      Array.from({ length: 2001 }, (_, i) => `themes/test/file-${String(i).padStart(4, '0')}.webp`),
    );
    const listings: unknown[] = [];
    mocks.send.mockImplementation(async (command) => {
      if (command instanceof ListObjectsV2Command) {
        listings.push(command.input);
        return {
          Contents: [...remaining].slice(0, 1000).map((Key) => ({ Key })),
          IsTruncated: remaining.size > 1000,
          NextContinuationToken: 'offset-1000',
        };
      }
      if (command instanceof DeleteObjectsCommand) {
        for (const item of command.input.Delete?.Objects ?? [])
          if (item.Key) remaining.delete(item.Key);
        return {};
      }
      throw new Error('Unexpected command');
    });
    await storage.deletePrefix('themes/test/');
    expect(remaining.size).toBe(0);
    expect(listings).toHaveLength(4);
    expect(listings.every((input) => !Object.hasOwn(input as object, 'ContinuationToken'))).toBe(
      true,
    );
  });
  it('rejects escaped listing keys and repeated deletion pages', async () => {
    const storage = createR2Storage(config);
    mocks.send.mockResolvedValueOnce({ Contents: [{ Key: 'other/private' }] });
    await expect(storage.deletePrefix('themes/test/')).rejects.toThrow('escaped');
    mocks.send.mockImplementation(async (command) =>
      command instanceof ListObjectsV2Command ? { Contents: [{ Key: key }] } : {},
    );
    await expect(storage.deletePrefix('themes/test/')).rejects.toThrow('no progress');
  });
  it('enumerates only immediate child prefixes across opaque paginated results', async () => {
    const storage = createR2Storage(config);
    mocks.send
      .mockResolvedValueOnce({
        CommonPrefixes: [{ Prefix: 'themes/test/v1/' }],
        IsTruncated: true,
        NextContinuationToken: 'next',
      })
      .mockResolvedValueOnce({
        CommonPrefixes: [{ Prefix: 'themes/test/v2/' }, { Prefix: 'themes/test/v1/' }],
      });
    await expect(storage.listPrefixes('themes/test/')).resolves.toEqual([
      'themes/test/v1/',
      'themes/test/v2/',
    ]);
    expect(mocks.send.mock.calls[1]?.[0]).toMatchObject({
      input: { Prefix: 'themes/test/', Delimiter: '/', ContinuationToken: 'next' },
    });
  });
  it('rejects nested/outside child prefixes and missing or repeated continuation tokens', async () => {
    const storage = createR2Storage(config);
    for (const Prefix of ['themes/elsewhere/v1/', 'themes/test/v1/attempt/']) {
      mocks.send.mockResolvedValueOnce({ CommonPrefixes: [{ Prefix }] });
      await expect(storage.listPrefixes('themes/test/')).rejects.toThrow('child prefixes');
    }
    mocks.send.mockResolvedValueOnce({ IsTruncated: true });
    await expect(storage.listPrefixes('themes/test/')).rejects.toThrow('pagination');
    mocks.send.mockResolvedValue({ IsTruncated: true, NextContinuationToken: 'repeat' });
    await expect(storage.listPrefixes('themes/test/')).rejects.toThrow('pagination');
  });
  it('validates all mutation input before sending any command and signs the content type', async () => {
    const storage = createR2Storage(config);
    await expect(storage.deleteMany(['themes/good.webp', '../bad'])).rejects.toThrow();
    await expect(storage.deletePrefix('')).rejects.toThrow();
    await expect(
      storage.put({
        key,
        body: new Uint8Array(),
        contentType: 'image/jpeg\r\nx-header: x',
        cacheControl: 'public',
      }),
    ).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
    await expect(
      storage.put({
        key,
        body: new Uint8Array(),
        contentType: 'image/jpeg\n',
        cacheControl: 'public',
      }),
    ).rejects.toThrow();
    await expect(
      storage.put({
        key,
        body: new Uint8Array(),
        contentType: 'image/jpeg',
        cacheControl: 'public\n',
      }),
    ).rejects.toThrow();
    await expect(storage.presignPut({ key, contentType: 'image/jpeg\n' })).rejects.toThrow();
    for (const field of ['accountId', 'accessKeyId', 'secretAccessKey', 'bucket'] as const)
      expect(() => createR2Storage({ ...config, [field]: `${config[field]}\n` })).toThrow(
        'configured correctly',
      );
    mocks.sign.mockResolvedValueOnce('https://signed.example.com');
    await expect(storage.presignPut({ key, contentType: 'image/jpeg' })).resolves.toBe(
      'https://signed.example.com',
    );
    expect(mocks.sign.mock.calls[0]?.[1]).toMatchObject({
      input: { Key: key, ContentType: 'image/jpeg' },
    });
    expect(mocks.sign.mock.calls[0]?.[2]).toEqual({
      expiresIn: 300,
      signableHeaders: new Set(['content-type']),
    });
    await expect(
      storage.presignPut({ key, contentType: 'image/jpeg', expiresIn: 3601 }),
    ).rejects.toThrow();
  });
});
