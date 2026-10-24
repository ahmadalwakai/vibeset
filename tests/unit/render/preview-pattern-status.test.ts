import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { APPS } from '../../../content/apps';
import { getPalette } from '../../../content/palettes';
import { contrast } from '../../../lib/render/color';
import { renderHomePreview, renderLockPreview } from '../../../lib/render/preview';
import type { RenderResult } from '../../../lib/render/types';
import { rasterize } from '../../../server/render/rasterize';
import { fixtureGlyphs, wallpaperFixture } from './wallpaper-fixture';

vi.mock('server-only', () => ({}));

function scrim(result: RenderResult) {
  return result.layers?.find((layer) => layer.result.svg.includes('status-scrim'));
}

function foreground(result: RenderResult): string {
  const color = result.layers?.at(-1)?.result.svg.match(/<svg\b[^>]*\bcolor="(#[a-f0-9]{6})"/)?.[1];
  if (!color) throw new Error('Preview chrome must expose its foreground');
  return color;
}

async function pixels(result: RenderResult): Promise<Buffer> {
  const png = await rasterize(result, { w: 360, h: 780, format: 'png' });
  return sharp(png).ensureAlpha().raw().toBuffer();
}

function pixel(bytes: Buffer, x: number, y: number): number[] {
  const offset = (Math.floor(y) * 360 + Math.floor(x)) * 4;
  return [...bytes.subarray(offset, offset + 4)];
}

describe('pattern preview status band', () => {
  it.each(['checker-indie', 'emo-pink'] as const)(
    'keeps status chrome readable on %s, fades the band and clips it to the phone screen',
    async (id) => {
      const palette = getPalette(id);
      if (!palette) throw new Error('The curated patterned palette must exist');
      const spec = wallpaperFixture();
      spec.palette = { ...palette, inkMuted: spec.palette.inkMuted };
      spec.wallpaper = { kind: 'pattern', pattern: 'checker', scale: 1, rotation: 0, colors: null };
      const home = renderHomePreview(spec, fixtureGlyphs, APPS, { w: 360, h: 780 });
      const band = scrim(home);
      if (!band || !home.layers) throw new Error('Pattern previews need a status band');
      expect(band).toMatchObject({ shape: 'rounded', x: 16.2, y: 19.5 });
      expect(band.result.svg).toContain('offset="0.6"');
      expect(band.result.svg).toContain('offset="1"');
      expect(band.result.svg).toContain('stop-opacity="0"');
      expect(contrast(foreground(home), palette.bg)).toBeGreaterThanOrEqual(4.5);
      const withoutBand = { ...home, layers: home.layers.filter((layer) => layer !== band) };
      const withPixels = await pixels(home);
      const underPixels = await pixels(withoutBand);
      const background = [1, 3, 5].map((offset) =>
        Number.parseInt(palette.bg.slice(offset, offset + 2), 16),
      );
      const x = band.x + band.w * 0.33;
      expect(pixel(withPixels, x, band.y + band.h * 0.05)).toEqual([...background, 255]);
      const fading = pixel(withPixels, x, band.y + band.h * 0.08);
      const beneath = pixel(underPixels, x, band.y + band.h * 0.08);
      expect(fading).not.toEqual(beneath);
      expect(fading).not.toEqual([...background, 255]);
      expect(pixel(withPixels, x, band.y + band.h * 0.115)).toEqual(
        pixel(underPixels, x, band.y + band.h * 0.115),
      );
      expect(pixel(withPixels, band.x + 1, band.y + 1)).toEqual(
        pixel(underPixels, band.x + 1, band.y + 1),
      );
    },
    10_000,
  );

  it('uses each selected wallpaper and leaves scatter and mesh previews without a band', () => {
    const spec = wallpaperFixture();
    const pattern = {
      kind: 'pattern' as const,
      pattern: 'checker' as const,
      scale: 1,
      rotation: 0,
      colors: null,
    };
    spec.lockWallpaper = pattern;
    expect(scrim(renderHomePreview(spec, fixtureGlyphs, APPS, { w: 360, h: 780 }))).toBeUndefined();
    expect(scrim(renderLockPreview(spec, fixtureGlyphs, { w: 360, h: 780 }))).toBeDefined();
    spec.lockWallpaper = spec.wallpaper;
    spec.wallpaper = pattern;
    expect(scrim(renderHomePreview(spec, fixtureGlyphs, APPS, { w: 360, h: 780 }))).toBeDefined();
    expect(scrim(renderLockPreview(spec, fixtureGlyphs, { w: 360, h: 780 }))).toBeUndefined();
    spec.lockWallpaper = null;
    expect(scrim(renderLockPreview(spec, fixtureGlyphs, { w: 360, h: 780 }))).toBeDefined();
    spec.wallpaper = {
      kind: 'scatter',
      seed: 1,
      glyphs: ['heart'],
      weight: 'regular',
      density: 0.5,
      sizeMin: 0.04,
      sizeMax: 0.1,
      rotate: true,
      grain: 0.08,
      colors: null,
    };
    expect(scrim(renderHomePreview(spec, fixtureGlyphs, APPS, { w: 360, h: 780 }))).toBeUndefined();
  });
});
