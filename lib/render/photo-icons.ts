import { ensureContrast, mixOklab } from './color';
import { iconStyleSchema } from './spec';
import type { IconStyle } from './spec';
import type { Palette } from './types';
import { resolveIconColours } from './icon-colors';

/** Three photo-recipe styles, each using the same contrast model as export and QA. */
export function photoIconSuggestions(palette: Palette, current: IconStyle): IconStyle[] {
  return (['solid', 'glass', 'outline'] as const).map((fill) => {
    const background =
      fill === 'glass'
        ? mixOklab(palette.primary, palette.surface, 0.6)
        : fill === 'outline'
          ? palette.bg
          : palette.primary;
    const colours = resolveIconColours(fill, palette) ?? {
      bg: background,
      bg2: null,
      glyphColor: ensureContrast(palette.ink, background, 3),
    };
    return iconStyleSchema.parse({
      ...current,
      ...colours,
      fill,
      border: null,
      sticker: null,
      shadow: false,
    });
  });
}
