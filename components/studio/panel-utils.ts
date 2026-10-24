import type { IconStyle, WallpaperSpec } from '@/lib/render/spec';
import type { FontId, Palette } from '@/lib/render/types';
import type { WallpaperPatch } from '@/lib/studio';

export function scatterSizePatch(
  wallpaper: Extract<WallpaperSpec, { kind: 'scatter' }>,
  edge: 'min' | 'max',
  value: number,
): WallpaperPatch {
  if (edge === 'min') {
    const sizeMin = Math.max(0.02, Math.min(0.2, value));
    return { sizeMin, sizeMax: Math.max(wallpaper.sizeMax, sizeMin) };
  }
  const sizeMax = Math.max(0.03, Math.min(0.35, value));
  return { sizeMax, sizeMin: Math.min(wallpaper.sizeMin, sizeMax) };
}

export function iconFillPatch(
  icons: IconStyle,
  palette: Palette,
  fill: IconStyle['fill'],
): Partial<IconStyle> {
  return { fill, ...(fill === 'gradient' ? { bg2: icons.bg2 ?? palette.accent } : {}) };
}

export function addPanelGlyph(values: readonly string[], glyph: string): string[] {
  return [...new Set([...values, glyph])].slice(0, 6);
}

export function fontFamilyFor(font: FontId): string {
  const variable = font === 'readex-pro' ? '--font-readex' : `--font-${font}`;
  return `var(${variable}), var(--font-el-messiri), var(--font-readex), sans-serif`;
}
