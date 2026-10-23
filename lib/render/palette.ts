import { mixOklab } from './color';
import type { Palette, WallpaperKind } from './types';

export function deriveWallpaperColors(palette: Palette, kind: WallpaperKind): string[] {
  if (kind === 'aurora') return [palette.bg, palette.primary, palette.accent];
  if (kind === 'sky') return [palette.bg, palette.primary, palette.accent, palette.surface];
  if (kind === 'pattern' || kind === 'shapes')
    return [palette.bg, palette.primary, palette.accent, palette.surface];
  return [palette.bg, palette.surface, palette.primary, palette.accent];
}

export function inkMuted(palette: Pick<Palette, 'ink' | 'bg'>): string {
  return mixOklab(palette.ink, palette.bg, 0.38);
}
