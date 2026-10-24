import type { CuratedPalette, StyleId } from '../generator';
import { toOklch } from './color';
import type { ThemeSpec } from './spec';

export function deriveStyleTags(spec: ThemeSpec, palette: CuratedPalette): StyleId[] {
  const kindTags: Record<ThemeSpec['wallpaper']['kind'], StyleId> = {
    mesh: 'gradient',
    blobs: 'gradient',
    aurora: 'gradient',
    pattern: 'pattern',
    scatter: 'illustrated',
    sky: 'illustrated',
    shapes: 'pattern',
    image: 'photo',
    waves: 'gradient',
  };
  const tags = new Set<StyleId>([kindTags[spec.wallpaper.kind]]);
  if (spec.icons.fill === 'glass') tags.add('glass');
  if (palette.id === 'cyber-neon' || palette.id === 'vaporwave') tags.add('neon');
  if (palette.id === 'noir' || palette.id === 'grunge') tags.add('monochrome');
  const background = toOklch(palette.bg);
  const primary = toOklch(palette.primary);
  if (palette.mode === 'light' && background.l > 0.88 && primary.l > 0.68 && primary.c < 0.14)
    tags.add('pastel');
  return [...tags];
}
