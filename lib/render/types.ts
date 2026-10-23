import type { FONT_IDS, GLYPH_WEIGHTS, IconStyle, ThemeSpec, WallpaperSpec } from './spec';

export type FontId = (typeof FONT_IDS)[number];
export type GlyphWeight = (typeof GLYPH_WEIGHTS)[number];
export type Palette = ThemeSpec['palette'];
export type WallpaperKind = WallpaperSpec['kind'];
export type IconFill = IconStyle['fill'];

export interface GlyphSource {
  get(name: string, weight: GlyphWeight): string | undefined;
}

export interface RenderDimensions {
  w: number;
  h: number;
  prefix?: string;
}

export interface ImagePlacement {
  x: number;
  y: number;
  w: number;
  h: number;
  shape?: 'square' | 'rounded' | 'circle' | 'squircle';
  radius?: number;
}

export interface ImageBackground {
  kind: 'image';
  assetKey: string;
  focalX: number;
  focalY: number;
  dim: number;
  placement?: ImagePlacement;
}

export interface RenderResult {
  svg: string;
  width: number;
  height: number;
  background?: ImageBackground;
  grain: number;
  noiseSeed: number;
  warnings: string[];
  layers?: RenderLayer[];
}

export interface RenderLayer extends ImagePlacement {
  result: RenderResult;
}

export interface IconRenderOptions {
  size: number;
  platform: 'ios' | 'shaped';
  palette: Palette;
  glyphs: GlyphSource;
  wallpaper?: RenderResult;
  prefix?: string;
}

export type WidgetKind = 'glyphBadge' | 'ring' | 'stickerCollage' | 'photoFrame';

export interface WeightedItem<T> {
  value: T;
  weight: number;
}

export interface Rng {
  next(): number;
  range(a: number, b: number): number;
  int(a: number, b: number): number;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly WeightedItem<T>[]): T;
  chance(probability: number): boolean;
  shuffle<T>(items: readonly T[]): T[];
}

export interface Point {
  x: number;
  y: number;
}
