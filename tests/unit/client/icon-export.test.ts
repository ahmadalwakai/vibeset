import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDTO } from '../../../lib/dto';
import { MAX_ICON_EXPORT_BYTES } from '../../../lib/icon-export';
import type { ExportIconsInput } from '../../../lib/icon-export';
import {
  exportIcons,
  prepareIconRenderContext,
  renderIconPreview,
} from '../../../lib/client/icon-export';
import { loadGlyphs } from '../../../lib/client/glyphs';
import { rasterizeInBrowser } from '../../../lib/client/rasterize';
import * as wallpaperRenderer from '../../../lib/render/wallpaper';
import { rasterize } from '../../../server/render/rasterize';
import { fixtureGlyphs, wallpaperFixture } from '../render/wallpaper-fixture';

vi.mock('server-only', () => ({}));
vi.mock('../../../lib/client/glyphs', () => ({ loadGlyphs: vi.fn() }));
vi.mock('../../../lib/client/rasterize', () => ({ rasterizeInBrowser: vi.fn() }));

const app = (index: number): AppDTO => ({
  slug: `app-${index}`,
  name: `App ${index}`,
  aliases: [],
  category: 'system',
  glyph: 'heart',
  rank: index,
});
const input = (overrides: Partial<ExportIconsInput> = {}): ExportIconsInput => ({
  slug: 'lilac-night',
  spec: wallpaperFixture(),
  apps: [app(1)],
  custom: [],
  platform: 'ios',
  ...overrides,
});
const yielding = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadGlyphs).mockResolvedValue(fixtureGlyphs);
  vi.mocked(rasterizeInBrowser).mockImplementation(
    async (result) => new Blob([result.svg], { type: 'image/png' }),
  );
  yielding.mockResolvedValue(undefined);
  vi.stubGlobal('scheduler', { yield: yielding });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('icon rendering context and export', () => {
  it('preserves catalog/custom order, produces stable files and reports every completed icon', async () => {
    const onProgress = vi.fn();
    const request = input({
      apps: [app(2), app(1)],
      custom: [
        { id: 'custom-00000000-0000-4000-8000-000000000001', label: 'تطبيقي', glyph: 'star' },
      ],
      onProgress,
    });
    const first = await exportIcons(request);
    const second = await exportIcons(request);
    expect(first.map(({ name }) => name)).toEqual([
      'vibeset-lilac-night-app-2.png',
      'vibeset-lilac-night-app-1.png',
      'vibeset-lilac-night-custom-00000000-0000-4000-8000-000000000001.png',
    ]);
    expect(await Promise.all(first.map((file) => file.text()))).toEqual(
      await Promise.all(second.map((file) => file.text())),
    );
    expect(first.every((file) => file.type === 'image/png')).toBe(true);
    expect(onProgress.mock.calls.slice(0, 4).map(([value]) => value)).toEqual([
      { completed: 0, total: 3 },
      { completed: 1, total: 3 },
      { completed: 2, total: 3 },
      { completed: 3, total: 3 },
    ]);
    expect(first.map((file) => file.name).join(' ')).not.toContain('تطبيقي');
    expect(rasterizeInBrowser).toHaveBeenCalledWith(expect.anything(), {
      w: 512,
      h: 512,
      type: 'image/png',
      signal: undefined,
    });
  });
  it('yields between four six-icon chunks and has a working timer fallback', async () => {
    await exportIcons(input({ apps: Array.from({ length: 24 }, (_, index) => app(index)) }));
    expect(rasterizeInBrowser).toHaveBeenCalledTimes(24);
    expect(yielding).toHaveBeenCalledTimes(3);
    vi.stubGlobal('scheduler', undefined);
    await expect(
      exportIcons(input({ apps: Array.from({ length: 7 }, (_, index) => app(index)) })),
    ).resolves.toHaveLength(7);
  });
  it('uses one generated wallpaper and all needed glyph weights for a wallpaper icon fill', async () => {
    const spec = wallpaperFixture();
    spec.icons.fill = 'wallpaper';
    spec.wallpaper = { kind: 'pattern', pattern: 'hearts', scale: 1, rotation: 0, colors: null };
    const renderWallpaper = vi.spyOn(wallpaperRenderer, 'renderWallpaper');
    await exportIcons(input({ spec, apps: [app(1), app(2), app(3)] }));
    expect(loadGlyphs).toHaveBeenCalledWith('regular', undefined);
    expect(loadGlyphs).toHaveBeenCalledWith('fill', undefined);
    expect(renderWallpaper).toHaveBeenCalledTimes(1);
  });
  it('uses the same honest photo-gradient fallback in mini previews and files without mutating the spec', async () => {
    const spec = wallpaperFixture();
    spec.icons.fill = 'wallpaper';
    spec.wallpaper = {
      kind: 'image',
      assetKey: 'uploads/wallpapers/00000000-0000-4000-8000-000000000001/full.jpg',
      focalX: 0.2,
      focalY: 0.7,
      dim: 0.3,
    };
    const before = structuredClone(spec);
    const context = await prepareIconRenderContext({ spec });
    expect(context.warnings).toEqual(['photo-wallpaper-fallback']);
    expect(context.icons.fill).toBe('gradient');
    expect(context.wallpaper).toBeUndefined();
    const preview = renderIconPreview({ context, glyph: 'heart', platform: 'ios', size: 512 });
    const onWarning = vi.fn();
    const [file] = await exportIcons(input({ spec, onWarning }));
    expect(await file?.text()).toBe(preview.svg);
    expect(onWarning).toHaveBeenCalledExactlyOnceWith('photo-wallpaper-fallback');
    expect(spec).toEqual(before);
    expect(vi.mocked(rasterizeInBrowser).mock.calls[0]?.[0].background).toBeUndefined();
  });
  it('renders four decor kinds at their documented sizes after selected icons', async () => {
    const files = await exportIcons(input({ decor: true }));
    expect(files.map(({ name }) => name)).toEqual([
      'vibeset-lilac-night-app-1.png',
      'vibeset-lilac-night-widget-glyphbadge.png',
      'vibeset-lilac-night-widget-ring.png',
      'vibeset-lilac-night-widget-stickercollage.png',
      'vibeset-lilac-night-widget-photoframe.png',
    ]);
    expect(
      vi.mocked(rasterizeInBrowser).mock.calls.map(([, options]) => [options.w, options.h]),
    ).toEqual([
      [512, 512],
      [512, 512],
      [512, 512],
      [1024, 482],
      [1024, 1072],
    ]);
  });
  it('reports a missing glyph once while retaining a neutral render fallback', async () => {
    const onWarning = vi.fn();
    const files = await exportIcons(
      input({
        apps: [
          { ...app(1), glyph: 'missing' },
          { ...app(2), glyph: 'missing' },
        ],
        onWarning,
      }),
    );
    expect(files).toHaveLength(2);
    expect(onWarning).toHaveBeenCalledExactlyOnceWith('missing-glyph');
    expect(await files[0]?.text()).toContain('<circle cx="128" cy="128" r="72"/>');
  });
  it('rejects name collisions and invalid/empty selections before loading resources', async () => {
    await expect(exportIcons(input({ apps: [app(1), app(1)] }))).rejects.toThrow('unique');
    await expect(
      exportIcons(input({ apps: [{ ...app(1), slug: 'widget-ring' }], decor: true })),
    ).rejects.toThrow('unique');
    await expect(exportIcons(input({ apps: [] }))).rejects.toThrow('Select');
    expect(loadGlyphs).not.toHaveBeenCalled();
  });
  it('cancels between items and rejects cancellation triggered by the final progress callback', async () => {
    const controller = new AbortController();
    const progress = vi.fn(({ completed }: { completed: number }) => {
      if (completed === 7) controller.abort();
    });
    await expect(
      exportIcons(
        input({
          apps: Array.from({ length: 24 }, (_, index) => app(index)),
          signal: controller.signal,
          onProgress: progress,
        }),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(rasterizeInBrowser).toHaveBeenCalledTimes(7);
    vi.mocked(rasterizeInBrowser).mockClear();
    const final = new AbortController();
    await expect(
      exportIcons(
        input({
          signal: final.signal,
          onProgress: ({ completed }) => {
            if (completed === 1) final.abort();
          },
        }),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(rasterizeInBrowser).toHaveBeenCalledTimes(1);
  });
  it('does not load anything for a pre-cancelled request and propagates rasterization failure', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(exportIcons(input({ signal: controller.signal }))).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(loadGlyphs).not.toHaveBeenCalled();
    vi.mocked(rasterizeInBrowser).mockRejectedValueOnce(new Error('canvas failed'));
    await expect(exportIcons(input())).rejects.toThrow('canvas failed');
  });
  it('enforces the aggregate byte budget before retaining an oversized result', async () => {
    class LargeBlob extends Blob {
      override get size(): number {
        return MAX_ICON_EXPORT_BYTES / 2 + 1;
      }
    }
    vi.mocked(rasterizeInBrowser).mockResolvedValue(new LargeBlob(['png'], { type: 'image/png' }));
    await expect(exportIcons(input({ apps: [app(1), app(2), app(3)] }))).rejects.toThrow('budget');
    expect(rasterizeInBrowser).toHaveBeenCalledTimes(2);
  });
  it.each(['ios', 'shaped'] as const)(
    'passes %s geometry through the real renderer with the expected PNG alpha',
    async (platform) => {
      const spec = wallpaperFixture();
      spec.icons.shape = 'circle';
      await exportIcons(input({ spec, platform }));
      const result = vi.mocked(rasterizeInBrowser).mock.calls[0]?.[0];
      if (!result) throw new Error('No rendered icon');
      const pixels = await sharp(await rasterize(result, { w: 64, h: 64, format: 'png' }))
        .ensureAlpha()
        .raw()
        .toBuffer();
      expect(pixels[3]).toBe(platform === 'ios' ? 255 : 0);
      expect(pixels[(32 * 64 + 32) * 4 + 3]).toBe(255);
    },
  );
});
