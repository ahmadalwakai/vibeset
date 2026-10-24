import { describe, expect, it } from 'vitest';
import { PALETTES } from '../../../content/palettes';
import { mixOklab } from '../../../lib/render/color';
import { minIconContrast, resolveIconColours } from '../../../lib/render/icon-colors';
import type { IconFill } from '../../../lib/render/types';
import { wallpaperFixture } from '../render/wallpaper-fixture';

const fills: readonly IconFill[] = [
  'solid',
  'gradient',
  'glass',
  'outline',
  'pattern',
  'wallpaper',
];

describe('generator icon colour selection', () => {
  it.each(PALETTES)('returns only passing choices for $id across every fill', (palette) => {
    const p = { ...palette, inkMuted: mixOklab(palette.ink, palette.bg, 0.38) };
    for (const fill of fills) {
      const colours = resolveIconColours(fill, p);
      if (colours) {
        const icons = { ...wallpaperFixture().icons, ...colours, fill };
        expect(minIconContrast(icons, p), `${palette.id}/${fill}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('picks the strongest eligible solid candidate rather than the first passing one', () => {
    const palette = wallpaperFixture().palette;
    expect(resolveIconColours('solid', palette)).toEqual({
      bg: palette.surface,
      bg2: null,
      glyphColor: palette.ink,
    });
  });

  it('requires contrast against both gradient stops', () => {
    const palette = {
      ...wallpaperFixture().palette,
      primary: '#000000',
      accent: '#ffffff',
      surface: '#ffffff',
      ink: '#000000',
    };
    expect(resolveIconColours('gradient', palette)).toBeNull();
    const icons = {
      ...wallpaperFixture().icons,
      fill: 'gradient' as const,
      bg: '#000000',
      bg2: '#ffffff',
      glyphColor: '#000000',
    };
    expect(minIconContrast(icons, palette)).toBe(1);
  });

  it('uses renderer fill bases when style.bg is irrelevant', () => {
    const palette = wallpaperFixture().palette;
    for (const fill of ['glass', 'outline', 'pattern', 'wallpaper'] as const) {
      const icons = { ...wallpaperFixture().icons, fill };
      expect(minIconContrast(icons, palette)).toBe(
        minIconContrast({ ...icons, bg: '#000000' }, palette),
      );
    }
  });

  it('reports no solution when the documented candidates cannot reach 3:1', () => {
    const palette = {
      mode: 'light' as const,
      bg: '#777777',
      surface: '#777777',
      primary: '#777777',
      accent: '#777777',
      ink: '#777777',
      inkMuted: '#777777',
    };
    for (const fill of fills) expect(resolveIconColours(fill, palette)).toBeNull();
  });
});
