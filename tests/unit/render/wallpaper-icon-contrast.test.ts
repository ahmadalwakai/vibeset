import sharp, { type OutputInfo } from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { renderIcon } from '@/lib/render/icon';
import { renderWallpaper } from '@/lib/render/wallpaper';
import { rasterize } from '@/server/render/rasterize';
import type { IconStyle } from '@/lib/render/spec';
import type { RenderResult } from '@/lib/render/types';
import { fixtureGlyphs, wallpaperFixture } from './wallpaper-fixture';

vi.mock('server-only', () => ({}));

const size = 128;
const primary = '#5fa77a';
const glyph = '#1a2b21';
const primaryPixel = [95, 167, 122, 255];
const glyphPixel = [26, 43, 33, 255];
const smallGlyph = '<rect x="96" y="96" width="64" height="64"/>';

function palette(): ReturnType<typeof wallpaperFixture>['palette'] {
  return { ...wallpaperFixture().palette, primary, surface: glyph };
}

function style(glyphScale: number): IconStyle {
  return {
    ...wallpaperFixture().icons,
    fill: 'wallpaper',
    glyphColor: glyph,
    glyphScale,
    shape: 'circle',
    border: null,
    sticker: null,
    shadow: false,
  };
}

async function rgba(
  result: RenderResult,
  focalBackground?: Uint8Array,
): Promise<{ data: Buffer; info: OutputInfo }> {
  return sharp(await rasterize(result, { w: size, h: size, format: 'png', focalBackground }))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

function pixel(image: { data: Buffer; info: OutputInfo }, x: number, y: number): number[] {
  const offset = (y * image.info.width + x) * image.info.channels;
  return [...image.data.subarray(offset, offset + image.info.channels)];
}

function expectGlyphPixel(actual: number[]): void {
  expect(actual[3]).toBe(255);
  // Native SVG filter color-space conversion can round glyph RGB by a couple of levels.
  for (let channel = 0; channel < 3; channel += 1) {
    expect(Math.abs((actual[channel] ?? 0) - (glyphPixel[channel] ?? 0))).toBeLessThanOrEqual(2);
  }
}

const generatedCases = (['ios', 'shaped'] as const).flatMap((platform) =>
  [0.4, 0.7].flatMap((glyphScale) =>
    ['#000000', '#ffffff'].map((background) => ({ platform, glyphScale, background })),
  ),
);

describe('wallpaper icon contrast surface', () => {
  it.each(generatedCases)(
    'paints an opaque primary badge over $background at scale $glyphScale on $platform',
    async ({ platform, glyphScale, background }) => {
      const wallpaper: RenderResult = {
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="256"><rect width="128" height="256" fill="${background}"/></svg>`,
        width: size,
        height: size * 2,
        grain: 0,
        noiseSeed: 0,
        warnings: [],
      };
      const icon = renderIcon(style(glyphScale), smallGlyph, {
        size,
        platform,
        palette: palette(),
        glyphs: fixtureGlyphs,
        wallpaper,
      });
      const image = await rgba(icon);
      const badgeTop = (size - Math.min(size * glyphScale * 1.2, size * 0.84)) / 2;
      expect(pixel(image, 64, Math.ceil(badgeTop + 3))).toEqual(primaryPixel);
      expectGlyphPixel(pixel(image, 64, 64));
      // The crop remains visible outside the central badge, including shaped icon interiors.
      expect(pixel(image, 8, 64)).toEqual(
        background === '#000000' ? [0, 0, 0, 255] : [191, 191, 191, 255],
      );
      expect(pixel(image, 0, 0)[3]).toBe(platform === 'ios' ? 255 : 0);
    },
  );

  it.each(['ios', 'shaped'] as const)(
    'keeps the primary badge opaque over a transparent photo on %s',
    async (platform) => {
      const spec = wallpaperFixture();
      spec.palette = palette();
      spec.wallpaper = {
        kind: 'image',
        assetKey: 'uploads/wallpapers/00000000-0000-4000-8000-000000000001/full.jpg',
        focalX: 0.5,
        focalY: 0.5,
        dim: 0.15,
      };
      const original = structuredClone(spec);
      const wallpaper = renderWallpaper(spec, 'home', { w: size, h: size * 2 }, fixtureGlyphs);
      const icon = renderIcon(style(0.5), smallGlyph, {
        size,
        platform,
        palette: spec.palette,
        glyphs: fixtureGlyphs,
        wallpaper,
      });
      const source = await sharp({
        create: {
          width: size,
          height: size * 2,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();
      const image = await rgba(icon, source);
      expect(pixel(image, 64, 31)).toEqual(primaryPixel);
      expectGlyphPixel(pixel(image, 64, 64));
      expect(pixel(image, 8, 64)[3]).toBe(255);
      expect(pixel(image, 0, 0)[3]).toBe(platform === 'ios' ? 255 : 0);
      expect(spec).toEqual(original);
      expect(renderWallpaper(spec, 'home', { w: size, h: size * 2 }, fixtureGlyphs)).toEqual(
        wallpaper,
      );
    },
  );
});
