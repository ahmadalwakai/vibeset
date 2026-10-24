import { describe, expect, it } from 'vitest';
import { qaSpec } from '../../../lib/render/qa';
import { wallpaperFixture } from '../render/wallpaper-fixture';

const names = new Set(['heart', 'star']);

describe('generator quality boundaries', () => {
  it('accepts the valid fixture and reports measured icon contrast', () => {
    const result = qaSpec(wallpaperFixture(), names);
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.minIconContrast).toBeGreaterThanOrEqual(3);
  });

  it.each([undefined, {}, { v: 2 }, { ...wallpaperFixture(), wallpaper: { kind: 'unknown' } }])(
    'rejects malformed specs without throwing',
    (input) => {
      expect(qaSpec(input, names)).toEqual({
        ok: false,
        reasons: ['Invalid theme spec'],
        minIconContrast: 0,
      });
    },
  );

  it('rejects low contrast and measures the worse gradient stop', () => {
    const spec = wallpaperFixture();
    spec.icons.fill = 'gradient';
    spec.icons.bg2 = '#ffffff';
    spec.icons.glyphColor = spec.icons.bg;
    const result = qaSpec(spec, names);
    expect(result.ok).toBe(false);
    expect(result.minIconContrast).toBe(1);
    expect(result.reasons).toContain('Icon contrast below 3:1');
  });

  it('rejects each independently insufficient palette distance', () => {
    const background = wallpaperFixture();
    background.palette.bg = background.palette.primary;
    expect(qaSpec(background, names).reasons).toContain(
      'Background and primary colours are too similar',
    );
    const accent = wallpaperFixture();
    accent.palette.accent = accent.palette.primary;
    expect(qaSpec(accent, names).reasons).toContain('Primary and accent colours are too similar');
  });

  it('checks decor, stickers, both scatter wallpapers and implicit pattern glyphs', () => {
    const spec = wallpaperFixture();
    spec.decor = ['unknown-decor'];
    spec.icons.sticker = { glyph: 'unknown-sticker', color: '#ffffff', corner: 'tr' };
    spec.wallpaper = {
      kind: 'scatter',
      seed: 1,
      glyphs: ['unknown-home'],
      weight: 'regular',
      density: 0.5,
      sizeMin: 0.04,
      sizeMax: 0.1,
      rotate: true,
      grain: 0.08,
      colors: null,
    };
    spec.lockWallpaper = { ...spec.wallpaper, glyphs: ['unknown-lock'] };
    expect(qaSpec(spec, names).reasons).toEqual([
      'Missing glyph: unknown-decor',
      'Missing glyph: unknown-sticker',
      'Missing glyph: unknown-home',
      'Missing glyph: unknown-lock',
    ]);
    spec.decor = [];
    spec.icons.sticker = null;
    spec.wallpaper = { kind: 'pattern', pattern: 'hearts', scale: 1, rotation: 0, colors: null };
    spec.lockWallpaper = { ...spec.wallpaper, pattern: 'stars' };
    expect(qaSpec(spec, new Set()).reasons).toEqual([
      'Missing glyph: heart',
      'Missing glyph: star',
    ]);
  });
});
