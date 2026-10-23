import { themeSpecSchema } from '../../../lib/render/spec';
import type { ThemeSpec } from '../../../lib/render/spec';
import type { GlyphSource } from '../../../lib/render/types';

export function wallpaperFixture(): ThemeSpec {
  return themeSpecSchema.parse({
    v: 1,
    palette: {
      mode: 'light',
      bg: '#eee7fa',
      surface: '#fbf8ff',
      primary: '#b9a3e8',
      accent: '#f5b8d9',
      ink: '#3b2d5c',
      inkMuted: '#81728f',
    },
    wallpaper: { kind: 'mesh', seed: 42, points: 5, softness: 0.5, grain: 0.08, colors: null },
    lockWallpaper: null,
    icons: {
      shape: 'squircle',
      fill: 'solid',
      bg: '#b9a3e8',
      bg2: null,
      glyphColor: '#3b2d5c',
      glyphWeight: 'regular',
      glyphScale: 0.55,
      border: null,
      sticker: null,
      shadow: false,
    },
    widgets: {
      style: 'glass',
      radius: 0.25,
      surface: '#fbf8ff',
      ink: '#3b2d5c',
      accent: '#f5b8d9',
    },
    type: { display: 'fraunces', body: 'readex-pro' },
    decor: ['heart', 'star'],
  });
}

export const fixtureGlyphs: GlyphSource = {
  get: (name): string | undefined =>
    name === 'heart' || name === 'star' ? '<path d="M128 24L232 128L128 232L24 128Z"/>' : undefined,
};
