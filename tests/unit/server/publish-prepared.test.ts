import { createHash } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { themeAssetFileSchema } from '../../../lib/validation/storage';
import type { ObjectStorage } from '../../../lib/validation/storage';
import type { RenderedPublishAssets } from '../../../server/render/publish-assets';
import type { ThemeSpec } from '../../../lib/render/spec';
import { themeAssetKey } from '../../../server/storage/keys';
import { createPrepublishedStaticStorage } from '../../../server/storage/prepublished-static';
import { publishTheme } from '../../../server/services/theme-publish';

const mocks = vi.hoisted(() => ({
  read: vi.fn<() => Promise<unknown[]>>(),
  render:
    vi.fn<
      (input: {
        themeId: string;
        assetVersion: number;
        attemptId: string;
        spec: ThemeSpec;
        storage: ObjectStorage;
      }) => Promise<RenderedPublishAssets>
    >(),
  updates: [] as Record<string, unknown>[],
  defaultPut: vi.fn<() => Promise<void>>(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../db/index', () => ({
  db: { select: () => ({ from: () => ({ where: mocks.read }) }) },
}));
vi.mock('../../../db/pool', () => ({
  dbPool: {
    transaction: async (work: (tx: unknown) => Promise<void>): Promise<void> =>
      work({
        select: () => ({ from: () => ({ where: () => ({ for: mocks.read }) }) }),
        update: () => ({
          set: (value: Record<string, unknown>) => {
            mocks.updates.push(value);
            return { where: () => ({ returning: async () => [{ id: 'published' }] }) };
          },
        }),
        execute: async (): Promise<void> => {},
      }),
  },
}));
vi.mock('../../../server/render/publish-assets', () => ({ renderPublishAssets: mocks.render }));
vi.mock('../../../server/services/theme-cache-tags', () => ({
  getThemeCacheTags: async (): Promise<string[]> => ['themes'],
}));
vi.mock('../../../server/services/theme-status', () => ({ assertTransition: vi.fn() }));
vi.mock('../../../server/audit', () => ({ auditInsert: vi.fn() }));
vi.mock('../../../server/storage/r2', () => ({ defaultStorage: { put: mocks.defaultPut } }));

const themeId = '11111111-1111-4111-8111-111111111111';
const attemptId = 'a2222222-b222-4222-8222-c22222222222';
const bytes = new Uint8Array([255, 216, 255, 5]);
const actor = { kind: 'system', label: 'static-beta' } as const;
const origin = 'https://static.example.test';
function files(attempt: string): RenderedPublishAssets['files'] {
  return themeAssetFileSchema.options.map((file) => ({
    key: themeAssetKey(themeId, 1, file, attempt),
    body: bytes,
    contentType: file.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
  }));
}
function storage(): ObjectStorage {
  return createPrepublishedStaticStorage({
    version: 1,
    origin,
    publications: [
      {
        themeId,
        specHash: 'a'.repeat(64),
        assetVersion: 1,
        attemptId,
        files: files(attemptId).map(({ key, body, contentType }) => ({
          key,
          bytes: body.byteLength,
          contentType,
          sha256: createHash('sha256').update(body).digest('hex'),
        })),
      },
    ],
  });
}
beforeEach(() => {
  mocks.updates.length = 0;
  mocks.defaultPut.mockReset().mockResolvedValue();
  mocks.read
    .mockReset()
    .mockResolvedValue([
      { id: themeId, assetVersion: 0, status: 'approved', specHash: 'a'.repeat(64), spec: {} },
    ]);
  mocks.render.mockReset().mockImplementation(async ({ attemptId: attempt, assetVersion }) => ({
    assets: {
      version: assetVersion,
      thumb: themeAssetKey(themeId, 1, 'thumb.webp', attempt),
      previewHome: themeAssetKey(themeId, 1, 'preview-home.webp', attempt),
      previewLock: themeAssetKey(themeId, 1, 'preview-lock.webp', attempt),
      og: themeAssetKey(themeId, 1, 'og.jpg', attempt),
      wallpapers: {},
    },
    files: files(attempt),
    dominantColor: '#000000',
    colorFamily: 'black',
    previewHash: '0'.repeat(64),
  }));
  vi.spyOn(console, 'error').mockImplementation((): void => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('prepared system publications', () => {
  it('refuses invalid UUIDs, user actors and missing explicit storage before database access', async () => {
    await expect(
      publishTheme({ themeId, actor, preparedAttemptId: `${attemptId}\n`, storage: storage() }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      publishTheme({ themeId, actor, preparedAttemptId: attemptId }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      publishTheme({
        themeId,
        actor: { kind: 'user', userId: 'admin', role: 'admin', isCreator: false },
        preparedAttemptId: attemptId,
        storage: storage(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it.each(['missing', 'changed'] as const)(
    'never enters a publication update when deployed bytes are %s',
    async (failure) => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockImplementation(async (url) =>
          failure === 'missing'
            ? new Response(null, { status: 404 })
            : new Response(new Uint8Array([0, 1, 2, 3]), {
                headers: {
                  'content-length': '4',
                  'content-type': String(url).endsWith('.webp') ? 'image/webp' : 'image/jpeg',
                },
              }),
        ),
      );
      await expect(
        publishTheme({ themeId, actor, preparedAttemptId: attemptId, storage: storage() }),
      ).rejects.toMatchObject({ code: 'RENDER_FAILED' });
      expect(mocks.updates.some((update) => update.status === 'published')).toBe(false);
      expect(mocks.defaultPut).not.toHaveBeenCalled();
    },
  );
  it('reuses the prepared keys and commits only after every regenerated object verifies live', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(
      async (url) =>
        new Response(Buffer.from(bytes), {
          headers: {
            'content-length': '4',
            'content-type': String(url).endsWith('.webp') ? 'image/webp' : 'image/jpeg',
          },
        }),
    );
    vi.stubGlobal('fetch', transport);
    await expect(
      publishTheme({
        themeId,
        actor,
        preparedAttemptId: attemptId.toUpperCase(),
        storage: storage(),
      }),
    ).resolves.toMatchObject({ data: { assetVersion: 1, skipped: false } });
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ attemptId }));
    expect(transport).toHaveBeenCalledTimes(7);
    expect(mocks.updates).toContainEqual(
      expect.objectContaining({
        status: 'published',
        assetVersion: 1,
        assetsSpecHash: 'a'.repeat(64),
      }),
    );
  });
  it('keeps the existing random-attempt default storage path for ordinary calls', async () => {
    await expect(publishTheme({ themeId, actor })).resolves.toMatchObject({
      data: { skipped: false },
    });
    expect(mocks.defaultPut).toHaveBeenCalledTimes(7);
    expect(mocks.render.mock.calls[0]?.[0].attemptId).not.toBe(attemptId);
  });
});
