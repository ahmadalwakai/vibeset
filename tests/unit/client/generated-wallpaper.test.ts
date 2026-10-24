import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWallpaperOptions,
  prepareWallpaper,
  screenDimensions,
} from '../../../lib/client/generated-wallpaper';
import { loadGlyphs } from '../../../lib/client/glyphs';
import { rasterizeInBrowser } from '../../../lib/client/rasterize';
import { prepareWallpaperFile } from '../../../lib/client/wallpaper';
import type { WallpaperDownloadDTO } from '../../../lib/dto';
import type { WallpaperOption } from '../../../lib/wallpaper-export';
import { fixtureGlyphs, wallpaperFixture } from '../render/wallpaper-fixture';

vi.mock('../../../lib/client/glyphs', () => ({ loadGlyphs: vi.fn() }));
vi.mock('../../../lib/client/rasterize', () => ({ rasterizeInBrowser: vi.fn() }));
vi.mock('../../../lib/client/wallpaper', () => ({ prepareWallpaperFile: vi.fn() }));
const option: WallpaperOption = { kind: 'render', size: 'desktop4k', w: 3840, h: 2160 };
const asset: WallpaperDownloadDTO = {
  size: 'phone',
  url: 'https://cdn.test/photo.jpg',
  w: 1320,
  h: 2868,
  bytes: 1024,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadGlyphs).mockResolvedValue(fixtureGlyphs);
  vi.mocked(rasterizeInBrowser).mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
});
afterEach(() => vi.restoreAllMocks());

describe('screen resolution constraints', () => {
  it('uses rounded physical device pixels and preserves ordinary screen dimensions', () => {
    expect(screenDimensions({ width: 393, height: 852, pixelRatio: 3 })).toEqual({
      w: 1179,
      h: 2556,
    });
    expect(screenDimensions({ width: 1365, height: 767, pixelRatio: 1.25 })).toEqual({
      w: 1706,
      h: 959,
    });
  });
  it('clamps area and each renderer dimension while preserving the aspect ratio', () => {
    const result = screenDimensions({ width: 7680, height: 4320, pixelRatio: 2 });
    expect(result.w * result.h).toBeLessThanOrEqual(16_700_000);
    expect(Math.abs(result.w / result.h - 16 / 9)).toBeLessThan(0.001);
    const wide = screenDimensions({ width: 1_000_000, height: 1, pixelRatio: 1 });
    expect(wide).toEqual({ w: 16_384, h: 1 });
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid device dimensions %s', (width) => {
    expect(() => screenDimensions({ width, height: 100, pixelRatio: 2 })).toThrow();
    expect(() => screenDimensions({ width: 100, height: 100, pixelRatio: width })).toThrow();
  });
});

describe('wallpaper option composition and preparation', () => {
  it('keeps stored files and adds generated-only 4K/screen choices; spec mode renders all sizes', () => {
    const spec = wallpaperFixture();
    const options = createWallpaperOptions({
      spec,
      wallpapers: [asset],
      screen: { w: 1179, h: 2556 },
    });
    expect(options).toEqual([
      { kind: 'cdn', asset },
      option,
      { kind: 'render', size: 'screen', w: 1179, h: 2556 },
    ]);
    expect(
      createWallpaperOptions({ spec }).map((entry) =>
        entry.kind === 'cdn' ? entry.asset.size : entry.size,
      ),
    ).toEqual(['phone', 'tablet', 'desktop', 'desktop4k']);
    expect(createWallpaperOptions({ spec, wallpapers: [] })).toEqual([option]);
    spec.wallpaper = {
      kind: 'image',
      assetKey: 'uploads/wallpapers/00000000-0000-4000-8000-000000000001/full.jpg',
      focalX: 0.5,
      focalY: 0.5,
      dim: 0.1,
    };
    expect(
      createWallpaperOptions({ spec, wallpapers: [asset], screen: { w: 100, h: 100 } }),
    ).toEqual([{ kind: 'cdn', asset }]);
  });
  it('renders the actual requested wallpaper at JPEG q0.92 and names its actual dimensions', async () => {
    const spec = wallpaperFixture();
    const before = structuredClone(spec);
    const controller = new AbortController();
    const file = await prepareWallpaper({ slug: 'night', spec, option, signal: controller.signal });
    expect(file.name).toBe('vibeset-night-desktop4k-3840x2160.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(rasterizeInBrowser).toHaveBeenCalledWith(
      expect.objectContaining({ width: 3840, height: 2160, grain: 0.08 }),
      { w: 3840, h: 2160, type: 'image/jpeg', quality: 0.92, signal: controller.signal },
    );
    expect(spec).toEqual(before);
    expect(loadGlyphs).not.toHaveBeenCalled();
  });
  it('loads the wallpaper weight when generated artwork uses glyphs', async () => {
    const spec = wallpaperFixture();
    spec.wallpaper = { kind: 'pattern', pattern: 'stars', scale: 1, rotation: 0, colors: null };
    await prepareWallpaper({ slug: 'stars', spec, option });
    expect(loadGlyphs).toHaveBeenCalledExactlyOnceWith('fill', undefined);
  });
  it('reuses the bounded CDN preparation path for published options', async () => {
    const file = new File(['jpeg'], 'prepared.jpg');
    vi.mocked(prepareWallpaperFile).mockResolvedValueOnce(file);
    const controller = new AbortController();
    await expect(
      prepareWallpaper({
        slug: 'night',
        spec: wallpaperFixture(),
        option: { kind: 'cdn', asset },
        signal: controller.signal,
      }),
    ).resolves.toBe(file);
    expect(prepareWallpaperFile).toHaveBeenCalledExactlyOnceWith('night', asset, controller.signal);
    expect(rasterizeInBrowser).not.toHaveBeenCalled();
  });
  it('rejects photo custom sizes, excessive axes/area and pre-cancelled requests before rasterization', async () => {
    const spec = wallpaperFixture();
    spec.wallpaper = {
      kind: 'image',
      assetKey: 'uploads/wallpapers/00000000-0000-4000-8000-000000000001/full.jpg',
      focalX: 0.5,
      focalY: 0.5,
      dim: 0.1,
    };
    await expect(prepareWallpaper({ slug: 'night', spec, option })).rejects.toThrow('generated');
    await expect(
      prepareWallpaper({
        slug: 'night',
        spec: wallpaperFixture(),
        option: { ...option, w: 4096, h: 4096 },
      }),
    ).rejects.toThrow('pixel');
    await expect(
      prepareWallpaper({
        slug: 'night',
        spec: wallpaperFixture(),
        option: { ...option, w: 17000, h: 1 },
      }),
    ).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(
      prepareWallpaper({
        slug: 'night',
        spec: wallpaperFixture(),
        option,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(rasterizeInBrowser).not.toHaveBeenCalled();
  });
  it('discards a completed raster after cancellation and rejects invalid encoded results', async () => {
    const controller = new AbortController();
    vi.mocked(rasterizeInBrowser).mockImplementationOnce(async () => {
      controller.abort();
      return new Blob(['jpeg'], { type: 'image/jpeg' });
    });
    await expect(
      prepareWallpaper({
        slug: 'night',
        spec: wallpaperFixture(),
        option,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    vi.mocked(rasterizeInBrowser).mockResolvedValueOnce(new Blob([], { type: 'image/jpeg' }));
    await expect(
      prepareWallpaper({ slug: 'night', spec: wallpaperFixture(), option }),
    ).rejects.toThrow('budget');
    vi.mocked(rasterizeInBrowser).mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));
    await expect(
      prepareWallpaper({ slug: 'night', spec: wallpaperFixture(), option }),
    ).rejects.toThrow('JPEG');
  });
});
