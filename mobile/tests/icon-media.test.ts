import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeIconPack } from '../../lib/validation/native-icon-pack';
import { saveThemeIcons, shareThemeIcon } from '../lib/icon-media';

const native = vi.hoisted(() => ({
  fetch: vi.fn(),
  permissions: vi.fn(),
  save: vi.fn(),
  available: vi.fn(),
  share: vi.fn(),
  createDirectory: vi.fn(),
  deleteDirectory: vi.fn(),
  write: vi.fn(),
  close: vi.fn(),
  abort: vi.fn(),
  bytes: new Map<string, number[]>(),
}));
vi.mock('expo/fetch', () => ({ fetch: native.fetch }));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: async (_algorithm: string, data: Uint8Array): Promise<ArrayBuffer> =>
    Uint8Array.from(createHash('sha256').update(data).digest()).buffer,
}));
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
      native.bytes.set(this.uri, []);
    }
    async bytes(): Promise<Uint8Array<ArrayBuffer>> {
      return Uint8Array.from(native.bytes.get(this.uri) ?? []);
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

// A real checked-in 512px PNG, rather than a signature-only pretend image.
const png = Uint8Array.from(
  readFileSync(new URL('../../public/icons/icon-512.png', import.meta.url)),
);
const sha256 = createHash('sha256').update(png).digest('hex');
const specHash = 'b'.repeat(64);
const pack: NativeIconPack = {
  version: 1,
  themeId: 'f5497e73-9a14-4d82-a1eb-baa931101bce',
  slug: 'lavender-haze',
  specHash,
  icons: ['calendar', 'messages'].map((appSlug, rank) => ({
    appSlug,
    name: appSlug,
    aliases: [],
    category: 'tools',
    rank,
    url: `https://cdn.vibeset.test/assets/theme-packs/v1/${specHash}/${appSlug}-${sha256}.png`,
    bytes: png.byteLength,
    w: 512,
    h: 512,
    sha256,
  })),
};

function response(body: BodyInit = png, headers: HeadersInit = {}): Response {
  return new Response(body, { headers: { 'Content-Type': 'image/png', ...headers } });
}

beforeEach(() => {
  vi.stubEnv('EXPO_PUBLIC_CDN_URL', 'https://cdn.vibeset.test/assets');
  vi.stubGlobal('__DEV__', false);
  vi.clearAllMocks();
  native.bytes.clear();
  native.fetch.mockReset().mockImplementation(async () => response());
  native.permissions.mockReset().mockResolvedValue({ granted: true });
  native.save.mockReset().mockResolvedValue({ id: 'confirmed-photos-asset' });
  native.available.mockReset().mockResolvedValue(true);
  native.share.mockReset().mockResolvedValue(undefined);
  native.createDirectory.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('native matching-icon media', () => {
  it('saves verified 512px PNGs sequentially in selected order and awaits durable progress before continuing', async () => {
    const saved: string[] = [];
    let persist: (() => void) | undefined;
    const writing = saveThemeIcons(pack, ['messages', 'calendar'], async (slug) => {
      saved.push(slug);
      if (slug === 'messages')
        await new Promise<void>((resolve) => {
          persist = resolve;
        });
    });
    await vi.waitFor(() => expect(saved).toEqual(['messages']));
    expect(native.fetch).toHaveBeenCalledOnce();
    expect(native.deleteDirectory).not.toHaveBeenCalled();
    persist?.();
    await writing;
    expect(saved).toEqual(['messages', 'calendar']);
    expect(native.permissions).toHaveBeenCalledWith(true, ['photo']);
    expect(native.save).toHaveBeenCalledTimes(2);
    expect(native.fetch).toHaveBeenNthCalledWith(
      1,
      pack.icons[1]?.url,
      expect.objectContaining({
        credentials: 'omit',
        redirect: 'error',
        headers: { Accept: 'image/png' },
      }),
    );
    expect(native.deleteDirectory).toHaveBeenCalledTimes(2);
    for (const [uri] of native.save.mock.calls) expect(native.bytes.get(uri)).toEqual([...png]);
  });

  it('shares one verified local PNG without Photos permission or claiming that an icon was installed', async () => {
    await shareThemeIcon(pack, 'calendar');
    expect(native.permissions).not.toHaveBeenCalled();
    expect(native.save).not.toHaveBeenCalled();
    expect(native.share).toHaveBeenCalledWith(
      expect.stringMatching(/vibeset-lavender-haze-calendar\.png$/),
      { mimeType: 'image/png', UTI: 'public.png' },
    );
    expect(native.deleteDirectory).toHaveBeenCalledOnce();
  });

  it.each([
    { slugs: ['unknown'] },
    { slugs: ['calendar', 'calendar'] },
    { slugs: ['../calendar'] },
  ])('rejects unknown, duplicate or unsafe selections before native prompts', async ({ slugs }) => {
    await expect(saveThemeIcons(pack, slugs, vi.fn())).rejects.toMatchObject({
      code: 'INVALID_ASSET',
    });
    expect(native.permissions).not.toHaveBeenCalled();
    expect(native.fetch).not.toHaveBeenCalled();
  });

  it.each([
    'https://other.test/assets/theme-packs/v1/',
    'https://cdn.vibeset.test/assets-wrong/theme-packs/v1/',
    'https://cdn.vibeset.test/assets/extra/theme-packs/v1/',
  ])('refuses assets outside the exact configured CDN namespace', async (prefix) => {
    const invalid = {
      ...pack,
      icons: pack.icons.map((icon) => ({
        ...icon,
        url: `${prefix}${specHash}/${icon.appSlug}-${sha256}.png`,
      })),
    };
    await expect(shareThemeIcon(invalid, 'calendar')).rejects.toMatchObject({
      code: 'INVALID_ASSET',
    });
    expect(native.fetch).not.toHaveBeenCalled();
  });

  it('fails closed when the public CDN is not configured', async () => {
    vi.stubEnv('EXPO_PUBLIC_CDN_URL', undefined);
    await expect(saveThemeIcons(pack, ['calendar'], vi.fn())).rejects.toMatchObject({
      code: 'CONFIG',
    });
    expect(native.permissions).not.toHaveBeenCalled();
  });

  it('bounds the aggregate selected pack before downloading', async () => {
    const icons = Array.from({ length: 33 }, (_, rank) => ({
      ...pack.icons[0],
      appSlug: `app-${rank}`,
      name: 'App',
      aliases: [],
      category: 'tools',
      rank,
      bytes: 2 * 1024 * 1024,
      w: 512 as const,
      h: 512 as const,
      sha256,
      url: `https://cdn.vibeset.test/assets/theme-packs/v1/${specHash}/app-${rank}-${sha256}.png`,
    }));
    await expect(
      saveThemeIcons(
        { ...pack, icons },
        icons.map((icon) => icon.appSlug),
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ASSET' });
    expect(native.permissions).not.toHaveBeenCalled();
  });

  it('does no work for an empty selection and refuses denied permission without downloading', async () => {
    await saveThemeIcons(pack, [], vi.fn());
    expect(native.permissions).not.toHaveBeenCalled();
    native.permissions.mockResolvedValue({ granted: false });
    await expect(saveThemeIcons(pack, ['calendar'], vi.fn())).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });
    expect(native.fetch).not.toHaveBeenCalled();
  });

  it.each([
    () => response(png, { 'Content-Type': 'text/html' }),
    () => response(png, { 'Content-Length': '1' }),
    () => response(png.slice(0, -1)),
    () => response(new Uint8Array(png.length + 1)),
    () => {
      const wrong = png.slice();
      wrong[16] = 1;
      return response(wrong);
    },
    () => {
      const wrong = png.slice();
      wrong[0] = 0;
      return response(wrong);
    },
    () => {
      const wrong = png.slice();
      wrong[wrong.length - 1] = (wrong[wrong.length - 1] ?? 0) ^ 1;
      return response(wrong);
    },
  ])(
    'rejects type, length, PNG dimensions/signature or SHA mismatches before saving',
    async (makeResponse) => {
      native.fetch.mockImplementation(async () => makeResponse());
      const saved = vi.fn();
      await expect(saveThemeIcons(pack, ['calendar'], saved)).rejects.toMatchObject({
        code: 'INVALID_ASSET',
      });
      expect(native.save).not.toHaveBeenCalled();
      expect(saved).not.toHaveBeenCalled();
    },
  );

  it('accepts a valid PNG header split across network chunks', async () => {
    native.fetch.mockResolvedValue(
      response(
        new ReadableStream({
          start(controller): void {
            controller.enqueue(png.slice(0, 1));
            controller.enqueue(png.slice(1, 23));
            controller.enqueue(png.slice(23, 33));
            controller.enqueue(png.slice(33));
            controller.close();
          },
        }),
      ),
    );
    await shareThemeIcon(pack, 'calendar');
    expect(native.write).toHaveBeenCalledTimes(4);
    expect(native.share).toHaveBeenCalledOnce();
  });

  it('preserves confirmed progress when cancelled during an OS save and does not start the next icon', async () => {
    const controller = new AbortController();
    const saved = vi.fn();
    native.save.mockImplementation(async () => {
      controller.abort();
    });
    await expect(
      saveThemeIcons(pack, ['calendar', 'messages'], saved, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(saved).toHaveBeenCalledExactlyOnceWith('calendar');
    expect(native.fetch).toHaveBeenCalledOnce();
    expect(native.deleteDirectory).toHaveBeenCalledOnce();
  });

  it('stops after a failed native save without recording that icon or erasing earlier progress', async () => {
    const saved = vi.fn();
    native.save
      .mockResolvedValueOnce({ id: 'first' })
      .mockRejectedValueOnce(new Error('private native failure'));
    await expect(saveThemeIcons(pack, ['calendar', 'messages'], saved)).rejects.toMatchObject({
      code: 'SAVE_FAILED',
    });
    expect(saved).toHaveBeenCalledExactlyOnceWith('calendar');
    expect(native.deleteDirectory).toHaveBeenCalledTimes(2);
  });

  it('does not continue if persisting a confirmed save fails', async () => {
    await expect(
      saveThemeIcons(pack, ['calendar', 'messages'], async () => {
        throw new Error('private storage failure');
      }),
    ).rejects.toMatchObject({ code: 'NETWORK' });
    expect(native.fetch).toHaveBeenCalledOnce();
    expect(native.save).toHaveBeenCalledOnce();
    expect(native.deleteDirectory).toHaveBeenCalledOnce();
  });

  it('bounds a stalled stream even if its reader ignores fetch cancellation', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    native.fetch.mockResolvedValue(
      response(new ReadableStream({ pull: () => new Promise(() => {}), cancel })),
    );
    const failed = expect(shareThemeIcon(pack, 'calendar')).rejects.toMatchObject({
      code: 'NETWORK',
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await failed;
    expect(cancel).toHaveBeenCalledOnce();
    expect(native.share).not.toHaveBeenCalled();
    expect(native.deleteDirectory).toHaveBeenCalledOnce();
  });

  it('cancels before Photos presentation and removes only its own temporary directory', async () => {
    const controller = new AbortController();
    native.fetch.mockImplementation(async () => {
      controller.abort();
      return response();
    });
    await expect(
      saveThemeIcons(pack, ['calendar'], vi.fn(), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(native.save).not.toHaveBeenCalled();
    expect(native.deleteDirectory).not.toHaveBeenCalled();
  });
});
