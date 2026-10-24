import { describe, expect, it } from 'vitest';
import { minIconContrast } from '../../../lib/render/icon-colors';
import { photoIconSuggestions } from '../../../lib/render/photo-icons';
import { derivePhotoPalette } from '../../../lib/render/photo-palette';
import { iconStyleSchema } from '../../../lib/render/spec';
import { wallpaperFixture } from './wallpaper-fixture';

describe('photo icon suggestions', () => {
  it.each([
    ['#ffffff'],
    ['#000000'],
    ['#777777'],
    ['#abcabc', '#cabcab'],
    ['#ff0000', '#00ff00', '#0000ff', '#f0f0f0', '#111111'],
  ])('provides three deterministic, legible styles for %j', (...colors: string[]) => {
    const palette = derivePhotoPalette(colors);
    const current = wallpaperFixture().icons;
    const suggestions = photoIconSuggestions(palette, current);
    expect(suggestions.map((style) => style.fill)).toEqual(['solid', 'glass', 'outline']);
    expect(suggestions).toEqual(photoIconSuggestions(palette, current));
    for (const suggestion of suggestions) {
      expect(iconStyleSchema.safeParse(suggestion).success).toBe(true);
      expect(minIconContrast(suggestion, palette)).toBeGreaterThanOrEqual(3);
      expect(suggestion.shape).toBe(current.shape);
      expect(suggestion.glyphWeight).toBe(current.glyphWeight);
      expect(suggestion).toMatchObject({ border: null, sticker: null, shadow: false });
    }
    expect(current).toEqual(wallpaperFixture().icons);
  });
});
