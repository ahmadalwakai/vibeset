import { describe, expect, it } from 'vitest';
import { renderAsync } from '@resvg/resvg-js';
import { PATTERNS, themeSpecSchema } from '../../../lib/render/spec';
import { renderWallpaper } from '../../../lib/render/wallpaper';
import { fixtureGlyphs, wallpaperFixture } from './wallpaper-fixture';
import type { WallpaperSpec } from '../../../lib/render/spec';

const wallpapers: WallpaperSpec[] = [
  { kind: 'mesh', seed: 42, points: 5, softness: 0.5, grain: 0.08, colors: null },
  { kind: 'blobs', seed: 42, count: 5, blur: 0.4, grain: 0.08, colors: null },
  { kind: 'waves', seed: 42, layers: 4, amplitude: 0.6, frequency: 0.4, grain: 0.08, colors: null },
  { kind: 'pattern', pattern: 'checker', scale: 1, rotation: 15, colors: null },
  {
    kind: 'scatter',
    seed: 42,
    glyphs: ['heart', 'star'],
    weight: 'regular',
    density: 0.7,
    sizeMin: 0.04,
    sizeMax: 0.1,
    rotate: true,
    grain: 0.08,
    colors: null,
  },
  { kind: 'aurora', seed: 42, bands: 3, grain: 0.08, colors: null },
  {
    kind: 'sky',
    seed: 42,
    mode: 'night',
    clouds: 0.4,
    stars: 0.7,
    moon: true,
    grain: 0.08,
    colors: null,
  },
  { kind: 'shapes', seed: 42, density: 0.8, grain: 0.08, colors: null },
  {
    kind: 'image',
    assetKey: 'uploads/wallpapers/12345678-abcd-1234-abcd-123456789abc/full.jpg',
    focalX: 0.4,
    focalY: 0.6,
    dim: 0.3,
  },
];

describe('wallpaper renderer', () => {
  it.each(wallpapers)('renders deterministic safe SVG for $kind', (wallpaper) => {
    const spec = themeSpecSchema.parse({ ...wallpaperFixture(), wallpaper });
    const result = renderWallpaper(spec, 'home', { w: 180, h: 390 }, fixtureGlyphs);
    expect(result).toEqual(renderWallpaper(spec, 'home', { w: 180, h: 390 }, fixtureGlyphs));
    expect(result.svg).toMatchSnapshot(wallpaper.kind);
    expect(result.width).toBe(180);
    expect(result.height).toBe(390);
    expect(result.warnings).toEqual([]);
    expect(result.svg).not.toMatch(
      /<(?:script|text|foreignObject|style)\b|\bhref\s*=|feTurbulence|NaN|Infinity/,
    );
    const ids = Array.from(result.svg.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of result.svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(match[1]);
    if ('seed' in wallpaper) {
      const changed = { ...spec, wallpaper: { ...wallpaper, seed: 43 } };
      expect(renderWallpaper(changed, 'home', { w: 180, h: 390 }, fixtureGlyphs).svg).not.toBe(
        result.svg,
      );
    }
  });

  it.each(PATTERNS)('renders the %s pattern with stable distinct artwork', (pattern) => {
    const spec = themeSpecSchema.parse({
      ...wallpaperFixture(),
      wallpaper: { kind: 'pattern', pattern, scale: 1.1, rotation: -12, colors: null },
    });
    const result = renderWallpaper(spec, 'home', { w: 180, h: 390 }, fixtureGlyphs);
    expect(result.svg).toMatchSnapshot(pattern);
    expect(result.warnings).toEqual([]);
    expect(result.svg).not.toMatch(/href\s*=|NaN|Infinity/);
  });

  it.each(['day', 'sunset'] as const)('renders %s skies with deterministic clouds', (mode) => {
    const spec = themeSpecSchema.parse({
      ...wallpaperFixture(),
      wallpaper: {
        kind: 'sky',
        seed: 42,
        mode,
        clouds: 0.8,
        stars: 0,
        moon: false,
        grain: 0.06,
        colors: null,
      },
    });
    expect(renderWallpaper(spec, 'home', { w: 180, h: 390 }, fixtureGlyphs).svg).toMatchSnapshot(
      mode,
    );
  });

  it.each([0.4, 0.8, 1])(
    'rasterizes day clouds at density %s without an out-of-bounds filter crash',
    async (clouds) => {
      const spec = themeSpecSchema.parse({
        ...wallpaperFixture(),
        wallpaper: {
          kind: 'sky',
          seed: 42,
          mode: 'day',
          clouds,
          stars: 0,
          moon: false,
          grain: 0.08,
          colors: null,
        },
      });
      const result = renderWallpaper(spec, 'home', { w: 180, h: 390 }, fixtureGlyphs);
      const raster = await renderAsync(result.svg);
      expect(raster.width).toBe(180);
      expect(raster.height).toBe(390);
      expect(raster.asPng().byteLength).toBeGreaterThan(1000);
    },
  );

  it('makes a null lock wallpaper identical to home and honors explicit lock artwork', () => {
    const spec = wallpaperFixture();
    expect(renderWallpaper(spec, 'lock', { w: 180, h: 390 }, fixtureGlyphs)).toEqual(
      renderWallpaper(spec, 'home', { w: 180, h: 390 }, fixtureGlyphs),
    );
    spec.lockWallpaper = { kind: 'shapes', seed: 19, density: 0.6, grain: 0.1, colors: null };
    expect(renderWallpaper(spec, 'lock', { w: 180, h: 390 }, fixtureGlyphs).svg).not.toBe(
      renderWallpaper(spec, 'home', { w: 180, h: 390 }, fixtureGlyphs).svg,
    );
  });

  it('honors explicit wallpaper colours in gradients and skies', () => {
    for (const wallpaper of wallpapers.filter((value) =>
      ['blobs', 'scatter', 'sky', 'pattern'].includes(value.kind),
    )) {
      const replacement =
        wallpaper.kind === 'pattern' ? { ...wallpaper, pattern: 'y2k-grid' as const } : wallpaper;
      const spec = themeSpecSchema.parse({
        ...wallpaperFixture(),
        wallpaper: { ...replacement, colors: ['#112233', '#445566', '#778899', '#aabbcc'] },
      });
      const svg = renderWallpaper(spec, 'home', { w: 180, h: 390 }, fixtureGlyphs).svg;
      expect(svg).not.toContain(spec.palette.primary);
      expect(svg).not.toContain(spec.palette.bg);
      expect(svg).not.toContain(spec.palette.surface);
      expect(svg).toMatch(/#112233|#445566|#778899|#aabbcc/);
    }
  });

  it('carries grain and photo metadata separately without loading an image into SVG', () => {
    const wallpaper = wallpapers.find((value) => value.kind === 'image');
    const spec = themeSpecSchema.parse({ ...wallpaperFixture(), wallpaper });
    const result = renderWallpaper(spec, 'home', { w: 180, h: 390 }, fixtureGlyphs);
    expect(result.background).toMatchObject(wallpaper ?? {});
    expect(result.grain).toBe(0);
    expect(result.svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="390" viewBox="0 0 180 390"><rect width="180" height="390" fill="#000000" opacity="0.3"/></svg>',
    );
    expect(
      renderWallpaper(wallpaperFixture(), 'home', { w: 180, h: 390 }, fixtureGlyphs),
    ).toMatchObject({ grain: 0.08, noiseSeed: 42 });
  });

  it('namespaces composition IDs and reports missing glyphs without empty shapes', () => {
    const spec = themeSpecSchema.parse({
      ...wallpaperFixture(),
      wallpaper: { kind: 'pattern', pattern: 'hearts', scale: 1, rotation: 0, colors: null },
    });
    const result = renderWallpaper(
      spec,
      'home',
      { w: 180, h: 390, prefix: 'preview-2' },
      { get: () => undefined },
    );
    expect(result.warnings).toEqual(['Missing glyph: heart (fill)']);
    expect(result.svg).toContain('id="preview-2-');
    expect(result.svg).toContain('<circle cx="128" cy="128" r="64"');
  });
});
