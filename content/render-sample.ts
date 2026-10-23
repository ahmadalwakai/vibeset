import { z } from 'zod';
import { FONT_IDS, themeSpecSchema, type ThemeSpec, type WallpaperSpec } from '../lib/render/spec';
import type { Palette, WallpaperKind } from '../lib/render/types';

// Used only by the development playground, renderer tests and render-sample CLI.
export const SAMPLE_PALETTES = {
  lavender: {
    mode: 'light',
    bg: '#eee7fa',
    surface: '#fbf8ff',
    primary: '#b9a3e8',
    accent: '#f5b8d9',
    ink: '#3b2d5c',
    inkMuted: '#837394',
  },
  sunset: {
    mode: 'light',
    bg: '#ffe8d6',
    surface: '#fff6ee',
    primary: '#ffa69e',
    accent: '#ffd166',
    ink: '#5a2a1e',
    inkMuted: '#916a5f',
  },
  matcha: {
    mode: 'light',
    bg: '#eef2e1',
    surface: '#fafbf4',
    primary: '#a8bf7a',
    accent: '#e9d8a6',
    ink: '#2f3a1e',
    inkMuted: '#758063',
  },
  midnight: {
    mode: 'dark',
    bg: '#14101f',
    surface: '#241b38',
    primary: '#b794f4',
    accent: '#f687b3',
    ink: '#f4eeff',
    inkMuted: '#b5a8c8',
  },
} as const satisfies Record<string, Palette>;

export const WALLPAPER_KINDS = [
  'mesh',
  'blobs',
  'waves',
  'pattern',
  'scatter',
  'aurora',
  'sky',
  'shapes',
  'image',
] as const satisfies readonly WallpaperKind[];

export const playgroundStateSchema = z.object({
  palette: z.enum(['lavender', 'sunset', 'matcha', 'midnight']).default('lavender'),
  kind: z.enum(WALLPAPER_KINDS).default('mesh'),
  seed: z.coerce.number().int().min(0).max(2_147_483_647).default(2026),
  grain: z.coerce.number().min(0).max(1).default(0.08),
  font: z.enum(FONT_IDS).default('fraunces'),
});

export type PlaygroundState = z.infer<typeof playgroundStateSchema>;

function sampleLuminance(hex: string): number {
  const channel = (offset: number): number => {
    const encoded = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function sampleGlyphColor(palette: Palette): string {
  // Keep these development controls light: use the WCAG formula without loading Culori.
  const minimumContrast = (candidate: string): number => {
    const ink = sampleLuminance(candidate);
    return Math.min(
      ...[palette.primary, palette.accent].map((background) => {
        const fill = sampleLuminance(background);
        return (Math.max(ink, fill) + 0.05) / (Math.min(ink, fill) + 0.05);
      }),
    );
  };
  return minimumContrast(palette.bg) > minimumContrast(palette.ink) ? palette.bg : palette.ink;
}

export function sampleWallpaper(kind: WallpaperKind, seed: number, grain: number): WallpaperSpec {
  const common = { seed, grain, colors: null };
  switch (kind) {
    case 'mesh':
      return { kind, ...common, points: 5, softness: 0.65 };
    case 'blobs':
      return { kind, ...common, count: 6, blur: 0.25 };
    case 'waves':
      return { kind, ...common, layers: 5, amplitude: 0.65, frequency: 0.5 };
    case 'pattern':
      return { kind, pattern: 'bows', scale: 1.2, rotation: -10, colors: null };
    case 'scatter':
      return {
        kind,
        ...common,
        glyphs: ['sparkle', 'heart', 'butterfly'],
        weight: 'regular',
        density: 0.65,
        sizeMin: 0.04,
        sizeMax: 0.15,
        rotate: true,
      };
    case 'aurora':
      return { kind, ...common, bands: 4 };
    case 'sky':
      return { kind, ...common, mode: 'sunset', clouds: 0.5, stars: 0.3, moon: false };
    case 'shapes':
      return { kind, ...common, density: 0.75 };
    case 'image':
      return {
        kind,
        // Local-only bytes supplied to the rasterizer; this reserved fixture key is never published.
        assetKey: 'uploads/wallpapers/00000000-0000-4000-8000-000000000001/full.jpg',
        focalX: 0.5,
        focalY: 0.5,
        dim: 0.15,
      };
  }
}

export function renderSampleSpec(input: PlaygroundState): ThemeSpec {
  const state = playgroundStateSchema.parse(input);
  const palette = SAMPLE_PALETTES[state.palette];
  return themeSpecSchema.parse({
    v: 1,
    palette,
    wallpaper: sampleWallpaper(state.kind, state.seed, state.grain),
    lockWallpaper: null,
    icons: {
      shape: 'squircle',
      fill: 'gradient',
      bg: palette.primary,
      bg2: palette.accent,
      glyphColor: sampleGlyphColor(palette),
      glyphWeight: 'regular',
      glyphScale: 0.55,
      border: null,
      sticker: { glyph: 'sparkle', color: palette.accent, corner: 'tr' },
      shadow: false,
    },
    widgets: {
      style: 'glass',
      radius: 0.22,
      surface: palette.surface,
      ink: palette.ink,
      accent: palette.accent,
    },
    type: { display: state.font, body: 'readex-pro' },
    decor: ['sparkle', 'heart', 'butterfly'],
  });
}
