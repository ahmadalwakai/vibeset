import { z } from 'zod';
import { contrast, ensureContrast, mixOklab, toOklch } from './color';
import { Hex, paletteSchema } from './spec';
import type { Palette } from './types';

/** Colours arrive in descending population order from deterministic photo extraction. */
export function derivePhotoPalette(colors: readonly string[]): Palette {
  const values = [...new Set(z.array(Hex).min(1).max(6).parse(colors))];
  const bg = values[0];
  if (!bg) throw new TypeError('Photo palette is empty');
  const mode = contrast('#000000', bg) >= contrast('#ffffff', bg) ? 'light' : 'dark';
  const neutral = mode === 'light' ? '#ffffff' : '#000000';
  const bySaturation = values
    .map((color, index) => ({ color, index, chroma: toOklch(color).c }))
    .sort((a, b) => b.chroma - a.chroma || a.index - b.index);
  const primary = bySaturation[0]?.color ?? bg;
  const accent =
    bySaturation[1]?.color ?? mixOklab(primary, mode === 'light' ? '#000000' : '#ffffff', 0.25);
  const extremes = [...values].sort((a, b) => toOklch(a).l - toOklch(b).l);
  const dark = extremes[0] ?? '#000000',
    light = extremes.at(-1) ?? '#ffffff';
  const candidate = contrast(dark, bg) >= contrast(light, bg) ? dark : light;
  const ink = ensureContrast(candidate, bg, 4.5);
  const inkMuted = ensureContrast(mixOklab(ink, bg, 0.38), bg, 4.5);
  return paletteSchema.parse({
    mode,
    bg,
    surface: mixOklab(bg, neutral, 0.15),
    primary,
    accent,
    ink,
    inkMuted,
  });
}
