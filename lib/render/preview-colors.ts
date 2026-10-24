import type { ThemeSpec, WallpaperSpec } from './spec';
import { contrast, mixOklab } from './color';
import { deriveWallpaperColors } from './palette';
import { colorAt } from './wallpaper/context';

/** Shared estimate for status chrome in SVG and editable DOM phone previews. */
export function previewForeground(spec: ThemeSpec, wallpaper: WallpaperSpec): string {
  if (wallpaper.kind === 'pattern')
    return ['#000000', '#ffffff', spec.palette.ink].reduce((best, candidate) =>
      contrast(candidate, spec.palette.bg) > contrast(best, spec.palette.bg) ? candidate : best,
    );
  if (wallpaper.kind !== 'sky') {
    const estimate = mixOklab(spec.palette.bg, spec.palette.primary, 0.25);
    return contrast('#ffffff', estimate) > contrast(spec.palette.ink, estimate)
      ? '#ffffff'
      : spec.palette.ink;
  }
  const colors = wallpaper.colors ?? deriveWallpaperColors(spec.palette, wallpaper.kind);
  const top =
    wallpaper.mode === 'night'
      ? mixOklab(colorAt(colors, 0), '#081128', 0.88)
      : wallpaper.mode === 'sunset'
        ? colorAt(colors, 2)
        : mixOklab(colorAt(colors, 1), colorAt(colors, 3), 0.15);
  return ['#000000', '#ffffff', spec.palette.ink].reduce((best, candidate) =>
    contrast(candidate, top) > contrast(best, top) ? candidate : best,
  );
}
