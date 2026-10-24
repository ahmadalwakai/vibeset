import type { ThemeSpec, WallpaperSpec } from './render/spec';
import type { FontId, GlyphWeight, IconFill } from './render/types';

export const MOOD_IDS = [
  'cute',
  'calm',
  'dreamy',
  'bold',
  'dark',
  'cozy',
  'elegant',
  'playful',
  'minimal',
  'retro',
  'edgy',
  'romantic',
  'fresh',
  'mysterious',
] as const;
export const SEASON_IDS = [
  'spring',
  'summer',
  'autumn',
  'winter',
  'ramadan',
  'eid',
  'halloween',
  'christmas',
  'valentine',
  'back-to-school',
] as const;
export const STYLE_IDS = [
  'pastel',
  'gradient',
  'pattern',
  'glass',
  'neon',
  'photo',
  'illustrated',
  'monochrome',
] as const;

export type MoodId = (typeof MOOD_IDS)[number];
export type SeasonId = (typeof SEASON_IDS)[number];
export type StyleId = (typeof STYLE_IDS)[number];
export type NumericRange = readonly [number, number];
export type NumericSetting = number | NumericRange;
export type GeneratedWallpaperKind = Exclude<WallpaperSpec['kind'], 'image'>;

type WallpaperFor<K extends GeneratedWallpaperKind> = Extract<WallpaperSpec, { kind: K }>;
type SampledParameter<T> = T extends number ? NumericSetting : T;

/** Seeds, palette colors and scatter glyphs/weight are supplied by the builder. */
export type WallpaperParameters<K extends GeneratedWallpaperKind> = {
  readonly [
    P in Exclude<keyof WallpaperFor<K>, 'kind' | 'seed' | 'colors' | 'glyphs' | 'weight'>
  ]?: SampledParameter<WallpaperFor<K>[P]>;
};

export type WallpaperChoice = {
  [K in GeneratedWallpaperKind]: {
    readonly kind: K;
    readonly weight: number;
    readonly params?: WallpaperParameters<K>;
  };
}[GeneratedWallpaperKind];

export interface CuratedPalette {
  readonly id: string;
  readonly nameEn: string;
  readonly nameAr: string;
  readonly mode: 'light' | 'dark';
  readonly bg: string;
  readonly surface: string;
  readonly primary: string;
  readonly accent: string;
  readonly ink: string;
}

export interface AestheticRecipe {
  readonly slug: string;
  readonly nameEn: string;
  readonly nameAr: string;
  readonly shortEn: string;
  readonly descriptionEn: string;
  readonly descriptionAr: string;
  readonly palettes: readonly string[];
  readonly wallpapers: readonly WallpaperChoice[];
  readonly lockWallpaper: 'same' | 'variant';
  readonly icons: {
    readonly fills: readonly IconFill[];
    readonly weights: readonly GlyphWeight[];
    readonly scale: NumericRange;
    readonly borderChance: number;
    readonly stickerChance: number;
    readonly shadowChance: number;
  };
  readonly widgets: {
    readonly styles: readonly ThemeSpec['widgets']['style'][];
    readonly radius: NumericRange;
  };
  readonly fonts: { readonly display: readonly FontId[]; readonly body: readonly FontId[] };
  readonly decor: readonly string[];
  readonly moods: readonly MoodId[];
  readonly styles: readonly StyleId[];
  readonly season?: SeasonId;
  readonly variants: number;
}

export type TaxonomyType = 'aesthetic' | 'mood' | 'season' | 'style';

export interface TaxonomyTag<Id extends string = string, Type extends TaxonomyType = TaxonomyType> {
  /** Canonical content id; season ids do not carry their storage prefix. */
  readonly id: Id;
  readonly slug: string;
  readonly kind: Type;
  readonly nameEn: string;
  readonly nameAr: string;
  readonly descriptionEn?: string;
  readonly descriptionAr?: string;
  readonly sortOrder: number;
}

export type SeedTag = TaxonomyTag;

export interface ThemeNames {
  readonly en: string;
  readonly ar: string;
}
