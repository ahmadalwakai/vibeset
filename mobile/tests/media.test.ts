import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playgroundStateSchema, renderSampleSpec } from '../../content/render-sample';
import type { ThemeDetailDTO } from '../../lib/dto';
import { MAX_WALLPAPER_BYTES } from '../../lib/wallpaper-export';
import { NativeMediaError, saveWallpaper, shareWallpaper } from '../lib/media';

const native = vi.hoisted(() => ({
  fetch: vi.fn(),
  permissions: vi.fn(),
  save: vi.fn(),
  available: vi.fn(),
  share: vi.fn(),
  createDirectory: vi.fn(),
  deleteDirectory: vi.fn(),
  createFile: vi.fn(),
  write: vi.fn(),
  close: vi.fn(),
  abort: vi.fn(),
  bytes: new Map<string, number[]>(),
}));

vi.mock('expo/fetch', () => ({ fetch: native.fetch }));
vi.mock('expo-media-library', () => ({
  Asset: { create: native.save },
  requestPermissionsAsync: native.permissions,
}));
vi.mock('expo-sharing', () => ({ isAvailableAsync: native.available, shareAsync: native.share }));
vi.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///native-cache/' } },
  Directory: class {
    readonly uri: string;
    constructor(parent: { uri: string }, name: string) {
      this.uri = `${parent.uri}${name}/`;
    }
    create(): void {
      native.createDirectory(this.uri);
    }
    delete(): void {
      native.deleteDirectory(this.uri);
    }
  },
  File: class {
    readonly uri: string;
    constructor(parent: { uri: string }, name: string) {
      this.uri = `${parent.uri}${name}`;
    }
    create(): void {
      native.createFile(this.uri);
      native.bytes.set(this.uri, []);
    }
    writableStream(): WritableStream<Uint8Array> {
      return new WritableStream({
        write: (chunk): void => {
          native.write(this.uri, chunk);
          native.bytes.set(this.uri, [...(native.bytes.get(this.uri) ?? []), ...chunk]);
        },
        close: (): void => {
          native.close(this.uri);
        },
        abort: (): void => {
          native.abort(this.uri);
        },
      });
    }
  },
}));

const jpeg = Uint8Array.of(255, 216, 255, 224, 255, 217);
const theme: ThemeDetailDTO = {
  id: 'f5497e73-9a14-4d82-a1eb-baa931101bce',
  slug: 'lavender-haze',
  nameEn: 'Lavender Haze',
  nameAr: 'ضباب اللافندر',
  descriptionEn: null,
  descriptionAr: null,
  thumbUrl: null,
  dominantColor: null,
  tags: [],
  isFeatured: false,
  downloadCount: 0,
  favoriteCount: 0,
  creator: null,
  publishedAt: null,
  updatedAt: '2026-10-24T12:00:00.000Z',
  spec: renderSampleSpec(playgroundStateSchema.parse({ kind: 'mesh', palette: 'lavender' })),
  previewHomeUrl: null,
  previewLockUrl: null,
  ogUrl: null,
  wallpapers: [
    {
      size: 'phone',
      url: 'https://cdn.vibeset.test/assets/themes/published/wallpaper-phone.jpg',
      w: 1320,
      h: 2868,
      bytes: jpeg.byteLength,
    },
  ],
  remixOf: null,
};

function response(body: BodyInit = jpeg, headers: HeadersInit = {}): Response {
  const values = new Headers(headers);
  if (!values.has('Content-Type')) values.set('Content-Type', 'image/jpeg');
  return new Response(body, { headers: values });
}

function wallpaper(patch: Partial<ThemeDetailDTO['wallpapers'][number]>): ThemeDetailDTO {
  return {
    ...theme,
    wallpapers: theme.wallpapers.map((asset) => ({ ...asset, ...patch })),
  };
}

beforeEach(() => {
  vi.stubEnv('EXPO_PUBLIC_CDN_URL', 'https://cdn.vibeset.test/assets');
  vi.stubGlobal('__DEV__', false);
  vi.clearAllMocks();
  native.bytes.clear();
  native.fetch.mockReset().mockImplementation(async () => response());
  native.permissions.mockReset().mockResolvedValue({ granted: true });
  native.save.mockReset().mockResolvedValue({ id: 'actual-native-save' });
  native.available.mockReset().mockResolvedValue(true);
  native.share.mockReset().mockResolvedValue(undefined);
  native.createDirectory.mockReset();
  native.deleteDirectory.mockReset();
  native.write.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('native wallpaper media', () => {
  it('downloads the real phone JPEG, requests add-only photo permission and saves a local file', async () => {
    native.save.mockImplementation(async (uri: string) => {
      expect(native.bytes.get(uri)).toEqual([...jpeg]);
      expect(native.deleteDirectory).not.toHaveBeenCalled();
      return { id: 'actual-native-save' };
    });
    await saveWallpaper(theme);
    expect(native.permissions).toHaveBeenCalledWith(true, ['photo']);
    expect(native.fetch).toHaveBeenCalledWith(
      theme.wallpapers[0]?.url,
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        headers: { Accept: 'image/jpeg' },
      }),
    );
    expect(native.save).toHaveBeenCalledWith(
      expect.stringMatching(
        /^file:\/\/\/native-cache\/vibeset-wallpaper-.+\/vibeset-lavender-haze-phone\.jpg$/,
      ),
    );
    expect(native.close).toHaveBeenCalledOnce();
    expect(native.deleteDirectory).toHaveBeenCalledWith(native.createDirectory.mock.calls[0]?.[0]);
  });

  it('shares a local JPEG URI without requesting photo-library access and removes it afterward', async () => {
    await shareWallpaper(theme);
    expect(native.permissions).not.toHaveBeenCalled();
    expect(native.save).not.toHaveBeenCalled();
    expect(native.share).toHaveBeenCalledWith(expect.stringContaining('file:///native-cache/'), {
      mimeType: 'image/jpeg',
      UTI: 'public.jpeg',
    });
    expect(native.deleteDirectory).toHaveBeenCalledOnce();
  });

  it('does not substitute a tablet or lock-preview image for a missing phone wallpaper', async () => {
    await expect(saveWallpaper(wallpaper({ size: 'tablet' }))).rejects.toMatchObject({
      code: 'NO_WALLPAPER',
    });
    expect(native.permissions).not.toHaveBeenCalled();
    expect(native.fetch).not.toHaveBeenCalled();
  });

  it('requires explicit public CDN configuration', async () => {
    vi.stubEnv('EXPO_PUBLIC_CDN_URL', undefined);
    await expect(saveWallpaper(theme)).rejects.toBeInstanceOf(NativeMediaError);
    await expect(saveWallpaper(theme)).rejects.toMatchObject({ code: 'CONFIG' });
    expect(native.fetch).not.toHaveBeenCalled();
  });

  it.each([
    'https://other.test/assets/phone.jpg',
    'https://cdn.vibeset.test/elsewhere/phone.jpg',
    'https://cdn.vibeset.test/assets-wrong/phone.jpg',
    'https://user:password@cdn.vibeset.test/assets/phone.jpg',
    'https://cdn.vibeset.test/assets/phone.jpg?token=secret',
    'https://cdn.vibeset.test/assets/phone.jpg#fragment',
    'file:///private/phone.jpg',
  ])('refuses an asset outside the configured public CDN boundary', async (url) => {
    await expect(shareWallpaper(wallpaper({ url }))).rejects.toMatchObject({
      code: 'INVALID_ASSET',
    });
    expect(native.fetch).not.toHaveBeenCalled();
  });

  it.each([{ bytes: MAX_WALLPAPER_BYTES + 1 }, { w: 100_000 }])(
    'refuses declared byte/pixel budgets before permission prompts',
    async (patch) => {
      await expect(saveWallpaper(wallpaper(patch))).rejects.toMatchObject({
        code: 'INVALID_ASSET',
      });
      expect(native.permissions).not.toHaveBeenCalled();
      expect(native.fetch).not.toHaveBeenCalled();
    },
  );

  it('reports denied permission and never downloads or pretends to save', async () => {
    native.permissions.mockResolvedValue({ granted: false });
    await expect(saveWallpaper(theme)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(native.fetch).not.toHaveBeenCalled();
    expect(native.save).not.toHaveBeenCalled();
  });

  it('reports unavailable permission APIs', async () => {
    native.permissions.mockRejectedValue(new Error('native permission module unavailable'));
    await expect(saveWallpaper(theme)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(native.fetch).not.toHaveBeenCalled();
  });

  it('reports an unavailable native share sheet before downloading', async () => {
    native.available.mockResolvedValue(false);
    await expect(shareWallpaper(theme)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(native.fetch).not.toHaveBeenCalled();
  });

  it('maps transport failure to a controlled error', async () => {
    native.fetch.mockRejectedValue(new Error('private transport diagnostics'));
    await expect(shareWallpaper(theme)).rejects.toMatchObject({ code: 'NETWORK' });
    expect(native.share).not.toHaveBeenCalled();
  });

  it('does not delete a directory whose creation failed', async () => {
    native.createDirectory.mockImplementation(() => {
      throw new Error('directory already exists');
    });
    await expect(shareWallpaper(theme)).rejects.toMatchObject({ code: 'NETWORK' });
    expect(native.deleteDirectory).not.toHaveBeenCalled();
    expect(native.share).not.toHaveBeenCalled();
  });

  it.each([
    () => new Response(jpeg, { status: 503 }),
    () => response(jpeg, { 'Content-Type': 'text/html' }),
    () => response(jpeg, { 'Content-Length': String(MAX_WALLPAPER_BYTES + 1) }),
    () => response(jpeg, { 'Content-Length': 'unknown' }),
  ])(
    'rejects unavailable/non-JPEG/mismatched responses without a prepared file',
    async (makeResponse) => {
      native.fetch.mockResolvedValue(makeResponse());
      await expect(shareWallpaper(theme)).rejects.toBeInstanceOf(NativeMediaError);
      expect(native.createFile).not.toHaveBeenCalled();
      expect(native.share).not.toHaveBeenCalled();
    },
  );

  it('enforces the actual byte bound even without a Content-Length header', async () => {
    native.fetch.mockResolvedValue(response(new Uint8Array(jpeg.byteLength + 1)));
    await expect(shareWallpaper(theme)).rejects.toMatchObject({ code: 'INVALID_ASSET' });
    expect(native.write).not.toHaveBeenCalled();
    expect(native.abort).toHaveBeenCalledOnce();
    expect(native.deleteDirectory).toHaveBeenCalledOnce();
  });

  it('validates a JPEG signature split across streaming chunks', async () => {
    native.fetch.mockResolvedValue(
      response(
        new ReadableStream({
          start(controller): void {
            controller.enqueue(jpeg.slice(0, 1));
            controller.enqueue(jpeg.slice(1, 2));
            controller.enqueue(jpeg.slice(2));
            controller.close();
          },
        }),
      ),
    );
    await shareWallpaper(theme);
    expect(native.write).toHaveBeenCalledTimes(3);
    expect(native.share).toHaveBeenCalledOnce();
  });

  it.each([
    () => response(Uint8Array.of(255, 216)),
    () => response(Uint8Array.of(60, 104, 116, 109, 108, 62)),
  ])(
    'removes truncated or invalid JPEG files without handing them to native APIs',
    async (makeResponse) => {
      native.fetch.mockResolvedValue(makeResponse());
      await expect(shareWallpaper(theme)).rejects.toMatchObject({ code: 'INVALID_ASSET' });
      expect(native.share).not.toHaveBeenCalled();
      expect(native.deleteDirectory).toHaveBeenCalledOnce();
    },
  );

  it('cleans up a stream failure after partially writing the file', async () => {
    let chunks = 0;
    native.fetch.mockResolvedValue(
      response(
        new ReadableStream({
          pull(controller): void {
            if (chunks++ === 0) controller.enqueue(jpeg.slice(0, 3));
            else controller.error(new Error('connection lost'));
          },
        }),
      ),
    );
    await expect(shareWallpaper(theme)).rejects.toMatchObject({ code: 'NETWORK' });
    expect(native.abort).toHaveBeenCalledOnce();
    expect(native.share).not.toHaveBeenCalled();
    expect(native.deleteDirectory).toHaveBeenCalledOnce();
  });

  it.each([
    { action: saveWallpaper, mock: native.save, code: 'SAVE_FAILED' },
    { action: shareWallpaper, mock: native.share, code: 'SHARE_FAILED' },
  ])(
    'reports native operation failure and removes the temporary file',
    async ({ action, mock, code }) => {
      mock.mockRejectedValue(new Error('private native failure'));
      await expect(action(theme)).rejects.toMatchObject({ code });
      expect(native.deleteDirectory).toHaveBeenCalledOnce();
    },
  );

  it('does not start an already-cancelled save', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(saveWallpaper(theme, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(native.permissions).not.toHaveBeenCalled();
    expect(native.fetch).not.toHaveBeenCalled();
  });

  it('does not hand a stale download to the share sheet', async () => {
    const controller = new AbortController();
    native.fetch.mockImplementation(async () => {
      controller.abort();
      return response();
    });
    await expect(shareWallpaper(theme, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(native.share).not.toHaveBeenCalled();
  });

  it('does not report success if the caller left while Photos was saving', async () => {
    const controller = new AbortController();
    native.save.mockImplementation(async () => {
      controller.abort();
    });
    await expect(saveWallpaper(theme, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(native.deleteDirectory).toHaveBeenCalledOnce();
  });

  it('aborts a stalled download after its bounded deadline', async () => {
    vi.useFakeTimers();
    native.fetch.mockImplementation(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    const failed = expect(shareWallpaper(theme)).rejects.toMatchObject({ code: 'NETWORK' });
    await vi.advanceTimersByTimeAsync(30_000);
    await failed;
    expect(native.share).not.toHaveBeenCalled();
  });

  it('keeps overlapping operations in separate temporary directories', async () => {
    await Promise.all([shareWallpaper(theme), saveWallpaper(theme)]);
    const paths = native.createFile.mock.calls.map(([uri]) => uri);
    expect(new Set(paths).size).toBe(2);
    expect(native.deleteDirectory).toHaveBeenCalledTimes(2);
  });
});
