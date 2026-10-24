import type {
  AestheticRecipe,
  CuratedPalette,
  NumericSetting,
  WallpaperChoice,
} from '../generator';
import { mixOklab } from './color';
import { resolveIconColours } from './icon-colors';
import { paletteSchema, themeSpecSchema, type ThemeSpec, type WallpaperSpec } from './spec';
import type { GlyphWeight, IconFill, Palette, Rng } from './types';

function makeWallpaper(
  choice: WallpaperChoice,
  decor: readonly string[],
  weights: readonly GlyphWeight[],
  rng: Rng,
): WallpaperSpec {
  const sample = (value: NumericSetting | undefined, fallback: number, integer = false): number => {
    if (value === undefined) return fallback;
    if (typeof value === 'number') return integer ? Math.round(value) : value;
    return integer ? rng.int(value[0], value[1]) : rng.range(value[0], value[1]);
  };
  const common = { seed: rng.int(0, 2_147_483_647), colors: null };
  switch (choice.kind) {
    case 'mesh':
      return {
        kind: choice.kind,
        ...common,
        points: sample(choice.params?.points, 5, true),
        softness: sample(choice.params?.softness, 0.6),
        grain: sample(choice.params?.grain, 0.08),
      };
    case 'blobs':
      return {
        kind: choice.kind,
        ...common,
        count: sample(choice.params?.count, 6, true),
        blur: sample(choice.params?.blur, 0.3),
        grain: sample(choice.params?.grain, 0.08),
      };
    case 'waves':
      return {
        kind: choice.kind,
        ...common,
        layers: sample(choice.params?.layers, 4, true),
        amplitude: sample(choice.params?.amplitude, 0.6),
        frequency: sample(choice.params?.frequency, 0.5),
        grain: sample(choice.params?.grain, 0.08),
      };
    case 'pattern':
      return {
        kind: choice.kind,
        colors: null,
        pattern: choice.params?.pattern ?? 'dots',
        scale: sample(choice.params?.scale, 1),
        rotation: sample(choice.params?.rotation, 0),
      };
    case 'scatter': {
      const sizeMin = sample(choice.params?.sizeMin, 0.04);
      return {
        kind: choice.kind,
        ...common,
        // Scatter requires a glyph even when the recipe has no decorative artwork.
        glyphs: decor.length ? rng.shuffle(decor).slice(0, 6) : ['circle'],
        weight: rng.pick(weights),
        density: sample(choice.params?.density, 0.5),
        sizeMin,
        sizeMax: Math.max(sizeMin, sample(choice.params?.sizeMax, 0.12)),
        rotate: choice.params?.rotate ?? true,
        grain: sample(choice.params?.grain, 0.08),
      };
    }
    case 'aurora':
      return {
        kind: choice.kind,
        ...common,
        bands: sample(choice.params?.bands, 3, true),
        grain: sample(choice.params?.grain, 0.08),
      };
    case 'sky':
      return {
        kind: choice.kind,
        ...common,
        mode: choice.params?.mode ?? 'day',
        clouds: sample(choice.params?.clouds, 0.4),
        stars: sample(choice.params?.stars, 0.3),
        moon: choice.params?.moon ?? false,
        grain: sample(choice.params?.grain, 0.08),
      };
    case 'shapes':
      return {
        kind: choice.kind,
        ...common,
        density: sample(choice.params?.density, 0.75),
        grain: sample(choice.params?.grain, 0.08),
      };
  }
}

function variantOf(wallpaper: WallpaperSpec): WallpaperSpec {
  if (wallpaper.kind === 'pattern')
    return {
      ...wallpaper,
      scale: Math.min(3, wallpaper.scale * 1.2),
      rotation: wallpaper.rotation * 0.7,
    };
  if (wallpaper.kind === 'image') return { ...wallpaper };
  const seed = (wallpaper.seed + 1) % 2_147_483_648;
  switch (wallpaper.kind) {
    case 'scatter':
    case 'shapes':
      return { ...wallpaper, seed, density: wallpaper.density * 0.7 };
    case 'waves':
      return { ...wallpaper, seed, amplitude: wallpaper.amplitude * 0.7 };
    case 'sky':
      return { ...wallpaper, seed, clouds: wallpaper.clouds * 0.7, stars: wallpaper.stars * 0.7 };
    default:
      return { ...wallpaper, seed };
  }
}

function iconColours(
  recipe: AestheticRecipe,
  palette: Palette,
  rng: Rng,
): {
  fill: IconFill;
  bg: string;
  bg2: string | null;
  glyphColor: string;
} {
  const selected = rng.pick(recipe.icons.fills);
  for (const fill of [selected, ...recipe.icons.fills.filter((fill) => fill !== selected)]) {
    const colours = resolveIconColours(fill, palette);
    if (colours) return { fill, ...colours };
  }
  return {
    fill: selected,
    bg: palette.primary,
    bg2: selected === 'gradient' ? palette.accent : null,
    // Retain a documented candidate known to fail, so QA can count this rejection.
    glyphColor:
      selected === 'outline'
        ? palette.primary
        : selected === 'glass' || selected === 'pattern'
          ? palette.ink
          : palette.surface,
  };
}

export function buildSpec(recipe: AestheticRecipe, palette: CuratedPalette, rng: Rng): ThemeSpec {
  const p = paletteSchema.parse({ ...palette, inkMuted: mixOklab(palette.ink, palette.bg, 0.38) });
  const choice = rng.weighted(recipe.wallpapers.map((value) => ({ value, weight: value.weight })));
  const wallpaper = makeWallpaper(choice, recipe.decor, recipe.icons.weights, rng);
  const colours = iconColours(recipe, p, rng);
  return themeSpecSchema.parse({
    v: 1,
    palette: p,
    wallpaper,
    lockWallpaper: recipe.lockWallpaper === 'same' ? null : variantOf(wallpaper),
    icons: {
      shape: rng.pick(['squircle', 'squircle', 'squircle', 'rounded', 'circle']),
      ...colours,
      glyphWeight: rng.pick(recipe.icons.weights),
      glyphScale: rng.range(...recipe.icons.scale),
      border: rng.chance(recipe.icons.borderChance) ? { width: 0.03, color: p.primary } : null,
      sticker:
        recipe.decor.length > 0 && rng.chance(recipe.icons.stickerChance)
          ? { glyph: rng.pick(recipe.decor), color: p.accent, corner: rng.pick(['tr', 'tl']) }
          : null,
      shadow: colours.fill === 'wallpaper' || rng.chance(recipe.icons.shadowChance),
    },
    widgets: {
      style: rng.pick(recipe.widgets.styles),
      radius: rng.range(...recipe.widgets.radius),
      surface: p.surface,
      ink: p.ink,
      accent: p.accent,
    },
    type: { display: rng.pick(recipe.fonts.display), body: 'readex-pro' },
    decor: rng.shuffle(recipe.decor).slice(0, Math.min(3, recipe.decor.length)),
  });
}
