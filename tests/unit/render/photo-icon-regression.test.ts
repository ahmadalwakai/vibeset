import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { composeLayers } from '../../../lib/render/composition';
import { renderIcon } from '../../../lib/render/icon';
import { renderWallpaper } from '../../../lib/render/wallpaper';
import { renderHomePreview } from '../../../lib/render/preview';
import { APPS } from '../../../content/apps';
import { rasterize } from '../../../server/render/rasterize';
import { fixtureGlyphs, wallpaperFixture } from './wallpaper-fixture';

vi.mock('server-only', () => ({}));

describe('photo icon and composition regressions', () => {
  it('keeps IDs unique when a caller supplies a long prefix', () => {
    const spec = wallpaperFixture();
    const child = renderIcon(spec.icons, undefined, {
      size: 64,
      platform: 'shaped',
      palette: spec.palette,
      glyphs: fixtureGlyphs,
    });
    const scene = composeLayers(
      128,
      64,
      [
        { result: child, x: 0, y: 0, w: 64, h: 64, shape: 'rounded' },
        { result: child, x: 64, y: 0, w: 64, h: 64, shape: 'circle' },
      ],
      'long-prefix-'.repeat(20),
    );
    const ids = [...scene.svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(2);
    expect(new Set(ids).size).toBe(ids.length);
    for (const reference of scene.svg.matchAll(/url\(#([^)]+)\)/g))
      expect(ids).toContain(reference[1]);
    const home = renderHomePreview(spec, fixtureGlyphs, APPS, {
      w: 360,
      h: 780,
      prefix: 'x'.repeat(100),
    });
    const homeIds = [...home.svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(homeIds).size).toBe(homeIds.length);
  });

  it.each(['ios', 'shaped'] as const)(
    'gives %s photo icons an opaque interior with a transparent PNG source',
    async (platform) => {
      const spec = wallpaperFixture();
      spec.wallpaper = {
        kind: 'image',
        assetKey: 'uploads/wallpapers/00000000-0000-4000-8000-000000000001/full.jpg',
        focalX: 0.5,
        focalY: 0.5,
        dim: 0.15,
      };
      const wallpaper = renderWallpaper(spec, 'home', { w: 64, h: 128 }, fixtureGlyphs);
      const style = {
        ...spec.icons,
        fill: 'wallpaper' as const,
        shape: 'circle' as const,
        shadow: false,
        sticker: null,
        border: null,
      };
      const photoIcon = renderIcon(style, undefined, {
        size: 64,
        platform,
        palette: spec.palette,
        glyphs: fixtureGlyphs,
        wallpaper,
      });
      const solidIcon = renderIcon({ ...style, fill: 'solid' }, undefined, {
        size: 64,
        platform,
        palette: spec.palette,
        glyphs: fixtureGlyphs,
      });
      const source = await sharp({
        create: {
          width: 64,
          height: 128,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();
      const pixels = await sharp(
        await rasterize(photoIcon, { w: 64, h: 64, format: 'png', focalBackground: source }),
      )
        .ensureAlpha()
        .raw()
        .toBuffer();
      const solidPixels = await sharp(await rasterize(solidIcon, { w: 64, h: 64, format: 'png' }))
        .ensureAlpha()
        .raw()
        .toBuffer();
      expect(pixels[(32 * 64 + 32) * 4 + 3]).toBe(255);
      expect(pixels[3]).toBe(platform === 'ios' ? 255 : 0);
      expect([...pixels].filter((_, index) => index % 4 === 3)).toEqual(
        [...solidPixels].filter((_, index) => index % 4 === 3),
      );
      expect(photoIcon.background?.placement?.shape).toBe(platform === 'ios' ? 'square' : 'circle');
    },
  );
});
