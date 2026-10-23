import type { Palette, Rng, GlyphSource } from '../types';
import { fmt } from '../svg';

export interface WallpaperContext {
  w: number;
  h: number;
  palette: Palette;
  colors: readonly string[];
  rng: Rng;
  id: (label?: string) => string;
  glyphs: GlyphSource;
  warnings: string[];
}

export interface WallpaperLayer {
  defs?: string;
  body: string;
}

export function clamp(value: number, low = 0, high = 1): number {
  return Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
}

export function colorAt(colors: readonly string[], index: number): string {
  const color = colors[((index % colors.length) + colors.length) % colors.length];
  return color && /^#[0-9a-f]{6}$/.test(color) ? color : '#808080';
}

export function blurFilter(id: string, w: number, h: number, sigma: number): string {
  const padding = Math.max(1, Math.ceil(sigma * 4));
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${fmt(-padding)}" y="${fmt(-padding)}" width="${fmt(w + padding * 2)}" height="${fmt(h + padding * 2)}"><feGaussianBlur stdDeviation="${fmt(sigma)}"/></filter>`;
}
