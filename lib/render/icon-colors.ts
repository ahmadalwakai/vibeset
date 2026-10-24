import { contrast, mixOklab } from './color';
import type { IconStyle } from './spec';
import type { IconFill, Palette } from './types';

type Colours = Pick<IconStyle, 'bg' | 'bg2' | 'glyphColor'>;

function backgrounds(fill: IconFill, colours: Colours, palette: Palette): string[] {
  switch (fill) {
    case 'gradient':
      return [colours.bg, colours.bg2 ?? colours.bg];
    case 'glass':
      return [mixOklab(palette.primary, palette.surface, 0.6)];
    case 'outline':
      return [palette.bg];
    case 'pattern':
      return [palette.surface];
    case 'wallpaper':
      return [palette.primary];
    case 'solid':
      return [colours.bg];
  }
}

/** The same documented fill-background model is used by selection and generator QA. */
export function minIconContrast(icons: IconStyle, palette: Palette): number {
  return Math.min(
    ...backgrounds(icons.fill, icons, palette).map((background) =>
      contrast(icons.glyphColor, background),
    ),
  );
}

export function resolveIconColours(fill: IconFill, palette: Palette): Colours | null {
  const { primary, surface, accent, ink, bg } = palette;
  const candidate = (
    background: string,
    glyphColor: string,
    bg2: string | null = null,
  ): Colours => ({ bg: background, bg2, glyphColor });
  const choices: Record<IconFill, Colours[]> = {
    solid: [
      candidate(primary, surface),
      candidate(primary, ink),
      candidate(surface, primary),
      candidate(surface, ink),
      candidate(accent, ink),
    ],
    gradient: [candidate(primary, surface, accent), candidate(primary, ink, accent)],
    glass: [
      candidate(mixOklab(primary, surface, 0.6), ink),
      candidate(mixOklab(primary, surface, 0.6), primary),
    ],
    outline: [candidate(bg, primary), candidate(bg, ink)],
    pattern: [candidate(surface, ink), candidate(surface, primary)],
    wallpaper: [candidate(primary, surface)],
  };
  let best: Colours | null = null;
  let bestContrast = 0;
  for (const colours of choices[fill]) {
    const score = Math.min(
      ...backgrounds(fill, colours, palette).map((background) =>
        contrast(colours.glyphColor, background),
      ),
    );
    if (score > bestContrast) {
      best = colours;
      bestContrast = score;
    }
  }
  return bestContrast >= 3 ? best : null;
}
