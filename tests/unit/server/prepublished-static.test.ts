import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { themeAssetFileSchema } from '../../../lib/validation/storage';
import {
  createPrepublishedStaticStorage,
  staticPublicationManifestSchema,
  type StaticPublicationManifest,
} from '../../../server/storage/prepublished-static';
import { themeAssetKey } from '../../../server/storage/keys';

vi.mock('server-only', () => ({}));
const themeId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const bytes = new Uint8Array([255, 216, 255, 5]);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const manifest: StaticPublicationManifest = {
  version: 1,
  origin: 'https://assets.example.test',
  publications: [
    {
      themeId,
      attemptId,
      specHash: 'a'.repeat(64),
      assetVersion: 1,
      files: themeAssetFileSchema.options.map((file) => ({
        key: themeAssetKey(themeId, 1, file, attemptId),
        bytes: bytes.length,
        sha256,
        contentType: file.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
      })),
    },
  ],
};
const key = themeAssetKey(themeId, 1, 'wallpaper-phone.jpg', attemptId);
const input = {
  key,
  body: bytes,
  contentType: 'image/jpeg',
  cacheControl: 'public, max-age=31536000, immutable',
};
const transport = vi.fn<typeof fetch>();
const mismatchedHeaders: Record<string, string>[] = [
  { 'content-type': 'text/html' },
  { 'content-length': '3' },
  { 'content-length': '4 4' },
  { 'content-encoding': 'gzip' },
];
function response(body: Uint8Array = bytes, headers: Record<string, string> = {}): Response {
  return new Response(Buffer.from(body), {
    headers: {
      'content-type': 'image/jpeg',
      'content-length': String(bytes.length),
      ...headers,
    },
  });
}
beforeEach(() => {
  vi.stubGlobal('fetch', transport);
  transport.mockReset().mockResolvedValue(response());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('bounded static publication manifest', () => {
  it('accepts only the complete canonical generated asset set and unique themes', () => {
    expect(staticPublicationManifestSchema.parse(manifest)).toEqual(manifest);
    const publication = manifest.publications[0];
    if (!publication) throw new Error('Missing test publication');
    for (const files of [
      publication.files.slice(1),
      [...publication.files.slice(1), publication.files[1]],
    ])
      expect(
        staticPublicationManifestSchema.safeParse({
          ...manifest,
          publications: [{ ...publication, files }],
        }).success,
      ).toBe(false);
    expect(
      staticPublicationManifestSchema.safeParse({
        ...manifest,
        publications: [publication, publication],
      }).success,
    ).toBe(false);
    expect(
      staticPublicationManifestSchema.safeParse({
        ...manifest,
        publications: Array.from({ length: 4 }, () => publication),
      }).success,
    ).toBe(false);
    expect(
      staticPublicationManifestSchema.safeParse({
        ...manifest,
        publications: [{ ...publication, attemptId: `${attemptId}\n` }],
      }).success,
    ).toBe(false);
  });
  it.each([
    'http://assets.example.test',
    'https://user:pass@assets.example.test',
    'https://assets.example.test/path',
    'https://assets.example.test?x=1',
    'https://assets.example.test#x',
    'https://assets.example.test\n',
  ])('rejects an unsafe origin %s before any request', (origin) => {
    expect(() => createPrepublishedStaticStorage({ ...manifest, origin })).toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('verification-only publication storage', () => {
  it('acknowledges only identical deployed bytes and uses no credentials, redirects or shared cache', async () => {
    const storage = createPrepublishedStaticStorage(manifest);
    await expect(storage.put(input)).resolves.toBeUndefined();
    expect(transport).toHaveBeenCalledWith(
      `${manifest.origin}/${key}`,
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        headers: { Accept: 'image/jpeg', 'Accept-Encoding': 'identity' },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(transport).toHaveBeenCalledOnce();
  });
  it('refuses a rendered mismatch or unknown key without contacting an external URL', async () => {
    const storage = createPrepublishedStaticStorage(manifest);
    for (const patch of [
      { key: key.replace(attemptId, themeId) },
      { body: new Uint8Array([1, 2, 3, 4]) },
      { body: new Uint8Array([1]) },
      { contentType: 'image/webp' },
      { cacheControl: 'public' },
    ])
      await expect(storage.put({ ...input, ...patch })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(mismatchedHeaders)('rejects differing response metadata %j', async (headers) => {
    transport.mockResolvedValue(response(bytes, headers));
    await expect(createPrepublishedStaticStorage(manifest).put(input)).rejects.toThrow(
      'verification failed',
    );
  });
  it('rejects missing content length and a server redirect even if its body matches', async () => {
    const storage = createPrepublishedStaticStorage(manifest);
    transport.mockResolvedValueOnce(
      new Response(Buffer.from(bytes), { headers: { 'content-type': 'image/jpeg' } }),
    );
    await expect(storage.put(input)).rejects.toThrow('verification failed');
    const redirected = response();
    Object.defineProperty(redirected, 'redirected', { value: true });
    transport.mockResolvedValueOnce(redirected);
    await expect(storage.put(input)).rejects.toThrow('verification failed');
    transport.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(storage.put(input)).rejects.toThrow('verification failed');
  });
  it('rejects truncated, oversized or changed deployed bytes despite matching header length', async () => {
    const storage = createPrepublishedStaticStorage(manifest);
    for (const body of [new Uint8Array([1]), new Uint8Array(5), new Uint8Array([0, 1, 2, 3])]) {
      transport.mockResolvedValueOnce(response(body));
      await expect(storage.put(input)).rejects.toThrow('verification failed');
    }
  });
  it('bounds both a stalled fetch and body read without waiting indefinitely on cleanup', async () => {
    vi.useFakeTimers();
    const storage = createPrepublishedStaticStorage(manifest);
    transport.mockImplementationOnce(() => new Promise(() => {}));
    const fetchResult = expect(storage.put(input)).rejects.toThrow('verification failed');
    await vi.advanceTimersByTimeAsync(15_000);
    await fetchResult;
    transport.mockResolvedValueOnce(
      new Response(new ReadableStream({ start(): void {} }), {
        headers: { 'content-type': 'image/jpeg', 'content-length': '4' },
      }),
    );
    const bodyResult = expect(storage.put(input)).rejects.toThrow('verification failed');
    await vi.advanceTimersByTimeAsync(15_000);
    await bodyResult;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('allows only fully verified manifest reads and refuses every unsupported mutation', async () => {
    const storage = createPrepublishedStaticStorage(manifest);
    await expect(storage.head(key)).resolves.toEqual({ bytes: 4, contentType: 'image/jpeg' });
    transport.mockResolvedValueOnce(response());
    expect(Array.from(await storage.getBytes(key))).toEqual(Array.from(bytes));
    for (const operation of [
      () => storage.deleteMany([key]),
      () => storage.deletePrefix('themes/'),
      () => storage.listPrefixes('themes/'),
      () => storage.presignPut({ key, contentType: 'image/jpeg' }),
      () => storage.getBytes('uploads/private.jpg'),
    ])
      await expect(operation()).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
