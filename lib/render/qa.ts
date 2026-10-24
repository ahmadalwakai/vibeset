import { deltaE } from './color';
import { minIconContrast } from './icon-colors';
import { themeSpecSchema } from './spec';

export function qaSpec(
  input: unknown,
  manifestNames: ReadonlySet<string>,
): { ok: boolean; reasons: string[]; minIconContrast: number } {
  const parsed = themeSpecSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reasons: ['Invalid theme spec'], minIconContrast: 0 };
  const spec = parsed.data;
  const reasons: string[] = [];
  const minimum = minIconContrast(spec.icons, spec.palette);
  if (minimum < 3) reasons.push('Icon contrast below 3:1');
  if (deltaE(spec.palette.bg, spec.palette.primary) < 0.08)
    reasons.push('Background and primary colours are too similar');
  if (deltaE(spec.palette.primary, spec.palette.accent) < 0.06)
    reasons.push('Primary and accent colours are too similar');
  const glyphs = new Set(spec.decor);
  if (spec.icons.sticker) glyphs.add(spec.icons.sticker.glyph);
  for (const wallpaper of [spec.wallpaper, spec.lockWallpaper]) {
    if (wallpaper?.kind === 'scatter') for (const glyph of wallpaper.glyphs) glyphs.add(glyph);
    if (wallpaper?.kind === 'pattern' && wallpaper.pattern === 'hearts') glyphs.add('heart');
    if (wallpaper?.kind === 'pattern' && wallpaper.pattern === 'stars') glyphs.add('star');
  }
  for (const glyph of glyphs)
    if (!manifestNames.has(glyph)) reasons.push(`Missing glyph: ${glyph}`);
  return { ok: reasons.length === 0, reasons, minIconContrast: minimum };
}
