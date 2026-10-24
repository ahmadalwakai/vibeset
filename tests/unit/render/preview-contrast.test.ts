import { describe, expect, it } from 'vitest';
import { getPalette } from '../../../content/palettes';
import { APPS } from '../../../content/apps';
import { contrast } from '../../../lib/render/color';
import { renderHomePreview, renderLockPreview } from '../../../lib/render/preview';
import type { WallpaperSpec } from '../../../lib/render/spec';
import type { RenderResult } from '../../../lib/render/types';
import { fixtureGlyphs, wallpaperFixture } from './wallpaper-fixture';

function sky(mode: 'day' | 'sunset' | 'night', colors: string[] | null = null): WallpaperSpec {
  return { kind: 'sky', mode, colors, seed: 42, clouds: 0.4, stars: 0.3, moon: false, grain: 0.08 };
}

function foreground(result: RenderResult): string {
  const chrome = result.layers?.at(-1)?.result.svg;
  const color = chrome?.match(/<svg\b[^>]*\bcolor="(#[a-f0-9]{6})"/)?.[1];
  if (!color) throw new Error('Preview chrome must expose its clock foreground');
  return color;
}

function topColor(result: RenderResult): string {
  const color = result.layers?.[1]?.result.svg.match(/<stop stop-color="(#[a-f0-9]{6})"/)?.[1];
  if (!color) throw new Error('Sky wallpaper must expose its top gradient stop');
  return color;
}

describe('preview sky contrast', () => {
  it.each([
    ['ramadan-cream', 'night'],
    ['noir', 'day'],
  ] as const)('uses the actual %s palette/%s sky rather than palette mode', (id, mode) => {
    const palette = getPalette(id);
    if (!palette) throw new Error('The curated palette must exist');
    const spec = wallpaperFixture();
    spec.palette = { ...palette, inkMuted: spec.palette.inkMuted };
    spec.wallpaper = sky(mode);
    const home = renderHomePreview(spec, fixtureGlyphs, APPS, { w: 360, h: 780 });
    const actual = foreground(home);
    const top = topColor(home);
    expect(actual).toBe(mode === 'night' ? '#ffffff' : '#000000');
    expect(contrast(actual, top)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(actual, top)).toBe(
      Math.max(...['#000000', '#ffffff', palette.ink].map((color) => contrast(color, top))),
    );
  });

  it.each(['day', 'sunset', 'night'] as const)(
    'respects explicit %s sky colors, including wrapped two-color arrays',
    (mode) => {
      for (const colors of [
        ['#000000', '#000000'],
        ['#ffffff', '#ffffff'],
        ['#222222', '#000000', '#ffffff', '#ffffff'],
      ]) {
        const spec = wallpaperFixture();
        spec.wallpaper = sky(mode, colors);
        const home = renderHomePreview(spec, fixtureGlyphs, APPS, { w: 360, h: 780 });
        expect(contrast(foreground(home), topColor(home))).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('selects independent home and lock foregrounds and reuses home for a null lock', () => {
    const spec = wallpaperFixture();
    spec.wallpaper = sky('night');
    spec.lockWallpaper = sky('day', ['#ffffff', '#ffffff']);
    const home = renderHomePreview(spec, fixtureGlyphs, APPS, { w: 360, h: 780 });
    const lock = renderLockPreview(spec, fixtureGlyphs, { w: 360, h: 780 });
    expect(foreground(home)).toBe('#ffffff');
    expect(foreground(lock)).toBe('#000000');
    expect(lock.layers?.[2]?.result.svg).toContain('color="#000000"');
    expect(contrast(foreground(lock), topColor(lock))).toBeGreaterThanOrEqual(4.5);
    spec.lockWallpaper = null;
    expect(foreground(renderLockPreview(spec, fixtureGlyphs, { w: 360, h: 780 }))).toBe('#ffffff');
  });

  it('preserves the existing foreground choice for non-sky artwork', () => {
    const spec = wallpaperFixture();
    expect(foreground(renderHomePreview(spec, fixtureGlyphs, APPS, { w: 360, h: 780 }))).toBe(
      spec.palette.ink,
    );
  });
});
