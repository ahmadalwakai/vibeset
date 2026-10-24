import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WallpaperDownloadDTO } from '../../../lib/dto';
import type { PlatformInfo } from '../../../lib/client/platform';
import { chooseWallpaperSize, prepareWallpaperFile } from '../../../lib/client/wallpaper';

vi.mock('../../../lib/env.client', () => ({
  env: { NEXT_PUBLIC_CDN_URL: 'https://cdn.test/assets' },
}));

const jpeg = new Uint8Array([255, 216, 255, 224, 0]);
const base: WallpaperDownloadDTO = {
  size: 'phone',
  url: 'https://cdn.test/assets/themes/night.jpg',
  w: 1320,
  h: 2868,
  bytes: 5,
};
const platform = (overrides: Partial<PlatformInfo>): PlatformInfo => ({
  platform: 'ios',
  isIPad: false,
  inAppBrowser: false,
  standalone: false,
  ...overrides,
});
const response = (data: Uint8Array = jpeg): Response =>
  new Response(new Uint8Array(data), { headers: { 'content-type': 'image/jpeg' } });
const signal = (): AbortSignal => new AbortController().signal;
afterEach(() => vi.unstubAllGlobals());

describe('available wallpaper defaults', () => {
  const tablet: WallpaperDownloadDTO = { ...base, size: 'tablet', w: 2048, h: 2732 };
  const desktop: WallpaperDownloadDTO = { ...base, size: 'desktop', w: 2560, h: 1440 };
  it('defaults by platform, then phone, then the first available file', () => {
    const options = [base, tablet, desktop];
    expect(chooseWallpaperSize(options, platform({ isIPad: true }))).toBe(tablet);
    expect(chooseWallpaperSize(options, platform({ platform: 'desktop' }))).toBe(desktop);
    expect(chooseWallpaperSize(options, platform({ platform: 'android' }))).toBe(base);
    expect(chooseWallpaperSize([base], platform({ platform: 'desktop' }))).toBe(base);
    expect(chooseWallpaperSize([tablet], platform({ platform: 'desktop' }))).toBe(tablet);
    expect(chooseWallpaperSize([], platform({}))).toBeUndefined();
  });
});

describe('wallpaper preparation', () => {
  it('prepares a named full-resolution JPEG with CORS, no cookies and cancellation', async () => {
    const fetcher = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetcher);
    const requestSignal = signal();
    const file = await prepareWallpaperFile('night-theme', base, requestSignal);
    expect(file.name).toBe('vibeset-night-theme-phone-1320x2868.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(jpeg);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(base.url, {
      mode: 'cors',
      credentials: 'omit',
      signal: requestSignal,
    });
  });

  it.each([
    'https://other.test/assets/image.jpg',
    'https://cdn.test/assets-other/image.jpg',
    'https://user:secret@cdn.test/assets/image.jpg',
    'https://cdn.test/assets/image.jpg?token=secret',
    'https://cdn.test/assets/image.jpg#fragment',
  ])('rejects non-CDN or credential-bearing URL %s before fetching', async (url) => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(prepareWallpaperFile('night', { ...base, url }, signal())).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects invalid filenames and excessive dimensions before fetching', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(prepareWallpaperFile('night\n', base, signal())).rejects.toThrow();
    await expect(prepareWallpaperFile('../night', base, signal())).rejects.toThrow();
    await expect(
      prepareWallpaperFile('night', { ...base, w: 4096, h: 4096 }, signal()),
    ).rejects.toThrow('pixel');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    new Response('unavailable', { status: 404, headers: { 'content-type': 'image/jpeg' } }),
    new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
    new Response('<html/>', { headers: { 'content-type': 'image/jpeg' } }),
    new Response('', { headers: { 'content-type': 'image/jpeg' } }),
  ])('rejects HTTP errors, incorrect MIME types and invalid JPEG bodies', async (result) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(result));
    await expect(prepareWallpaperFile('night', base, signal())).rejects.toThrow();
    expect(result.body?.locked).toBe(false);
  });

  it('bounds declared lengths and cancels unread bodies', async () => {
    const cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel: cancelled });
    const result = new Response(stream, {
      headers: { 'content-type': 'image/jpeg', 'content-length': String(32 * 1024 * 1024 + 1) },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(result));
    await expect(prepareWallpaperFile('night', base, signal())).rejects.toThrow('limit');
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  it('bounds actual bytes even when the server omits content-length', async () => {
    const cancelled = vi.fn();
    let reads = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads += 1;
        controller.enqueue(new Uint8Array(17 * 1024 * 1024));
      },
      cancel: cancelled,
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(stream, { headers: { 'content-type': 'image/jpeg' } })),
    );
    await expect(prepareWallpaperFile('night', base, signal())).rejects.toThrow('limit');
    expect(reads).toBeLessThanOrEqual(3);
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  it('honors cancellation before fetch and while awaiting streamed bytes', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const early = new AbortController();
    early.abort();
    await expect(prepareWallpaperFile('night', base, early.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetcher).not.toHaveBeenCalled();

    const controller = new AbortController();
    const cancelled = vi.fn();
    let started: () => void = () => {};
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const stream = new ReadableStream<Uint8Array>({
      pull: () => {
        started();
      },
      cancel: cancelled,
    });
    fetcher.mockResolvedValue(new Response(stream, { headers: { 'content-type': 'image/jpeg' } }));
    const pending = prepareWallpaperFile('night', base, controller.signal);
    await reading;
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  it('propagates network/read failures and releases the reader', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(prepareWallpaperFile('night', base, signal())).rejects.toThrow('offline');
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('connection lost'));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(stream, { headers: { 'content-type': 'image/jpeg' } })),
    );
    await expect(prepareWallpaperFile('night', base, signal())).rejects.toThrow('connection lost');
    expect(stream.locked).toBe(false);
  });
});
