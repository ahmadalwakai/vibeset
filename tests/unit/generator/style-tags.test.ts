import { describe, expect, it } from 'vitest';
import { sampleWallpaper } from '../../../content/render-sample';
import type { CuratedPalette } from '../../../lib/generator';
import { deriveStyleTags } from '../../../lib/render/style-tags';
import type { WallpaperKind } from '../../../lib/render/types';
import { wallpaperFixture } from '../render/wallpaper-fixture';

function palette(overrides: Partial<CuratedPalette> = {}): CuratedPalette {
  return {
    ...wallpaperFixture().palette,
    id: 'custom',
    nameEn: 'Custom',
    nameAr: 'خاص',
    ...overrides,
  };
}

describe('derived generator style tags', () => {
  it.each<[WallpaperKind, string]>([
    ['mesh', 'gradient'],
    ['blobs', 'gradient'],
    ['waves', 'gradient'],
    ['aurora', 'gradient'],
    ['pattern', 'pattern'],
    ['shapes', 'pattern'],
    ['scatter', 'illustrated'],
    ['sky', 'illustrated'],
    ['image', 'photo'],
  ])('maps %s wallpaper to %s', (kind, tag) => {
    const spec = wallpaperFixture();
    spec.wallpaper = sampleWallpaper(kind, 42, 0.08);
    expect(deriveStyleTags(spec, palette())).toContain(tag);
  });

  it('uses explicit curated ids for neon and monochrome', () => {
    const spec = wallpaperFixture();
    for (const id of ['cyber-neon', 'vaporwave'])
      expect(deriveStyleTags(spec, palette({ id }))).toContain('neon');
    for (const id of ['noir', 'grunge'])
      expect(deriveStyleTags(spec, palette({ id }))).toContain('monochrome');
    expect(deriveStyleTags(spec, palette({ id: 'cyber-neon-copy' }))).not.toContain('neon');
    expect(deriveStyleTags(spec, palette({ id: 'cloud-nine' }))).not.toContain('monochrome');
  });

  it('adds glass and qualifies pastel using all four conditions', () => {
    const spec = wallpaperFixture();
    spec.icons.fill = 'glass';
    expect(deriveStyleTags(spec, palette())).toEqual(['gradient', 'glass', 'pastel']);
    for (const overrides of [
      { mode: 'dark' as const },
      { bg: '#000000' },
      { primary: '#444444' },
      { primary: '#ff0000' },
    ])
      expect(deriveStyleTags(spec, palette(overrides))).not.toContain('pastel');
  });
});
