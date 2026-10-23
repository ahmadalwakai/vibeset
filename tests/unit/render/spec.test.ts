import { describe, expect, it } from 'vitest';
import {
  AssetKey,
  GlyphName,
  Hex,
  Seed,
  Unit,
  themeSpecSchema,
  wallpaperSchema,
} from '@/lib/render/spec';
import type { ThemeSpec } from '@/lib/render/spec';

function sampleSpec(): ThemeSpec {
  return {
    v: 1,
    palette: {
      mode: 'light',
      bg: '#faf8fc',
      surface: '#ffffff',
      primary: '#9734b1',
      accent: '#ff8b58',
      ink: '#16121d',
      inkMuted: '#665c76',
    },
    wallpaper: { kind: 'mesh', seed: 42, points: 5, softness: 0.5, grain: 0.08, colors: null },
    lockWallpaper: null,
    icons: {
      shape: 'squircle',
      fill: 'solid',
      bg: '#9734b1',
      bg2: null,
      glyphColor: '#ffffff',
      glyphWeight: 'regular',
      glyphScale: 0.55,
      border: null,
      sticker: null,
      shadow: false,
    },
    widgets: {
      style: 'glass',
      radius: 0.25,
      surface: '#ffffff',
      ink: '#16121d',
      accent: '#ff8b58',
    },
    type: { display: 'fraunces', body: 'readex-pro' },
    decor: ['sparkle', 'heart'],
  };
}

describe('ThemeSpec', () => {
  it('accepts a complete valid spec with explicit nullable fields', () => {
    expect(themeSpecSchema.parse(sampleSpec())).toEqual(sampleSpec());
  });

  it('normalizes hex colours throughout the spec to lowercase', () => {
    const spec = sampleSpec();
    spec.palette.primary = '#ABCDEF';
    spec.icons.glyphColor = '#FEDCBA';
    if (spec.wallpaper.kind === 'mesh') {
      spec.wallpaper = { ...spec.wallpaper, colors: ['#AABBCC', '#DDEEFF'] };
    }

    const parsed = themeSpecSchema.parse(spec);

    expect(parsed.palette.primary).toBe('#abcdef');
    expect(parsed.icons.glyphColor).toBe('#fedcba');
    expect(parsed.wallpaper).toMatchObject({ colors: ['#aabbcc', '#ddeeff'] });
  });

  it.each(['#fff', '#12345678', '#gg0000', 'ff0000', 'red', '#123456<script>'])(
    'rejects invalid hex colour %s',
    (color) => {
      const spec = sampleSpec();
      spec.palette.bg = color;
      expect(themeSpecSchema.safeParse(spec).success).toBe(false);
    },
  );

  it.each(['Sparkle', 'star_fill', '../star', '<path>', '', 'a'.repeat(49)])(
    'rejects unsafe glyph name %s',
    (glyph) => {
      expect(themeSpecSchema.safeParse({ ...sampleSpec(), decor: [glyph] }).success).toBe(false);
    },
  );

  it.each(['wallpaper', 'lockWallpaper'] as const)(
    'rejects scatter sizeMin above sizeMax in %s',
    (path) => {
      const spec = {
        ...sampleSpec(),
        [path]: {
          kind: 'scatter',
          seed: 42,
          glyphs: ['sparkle'],
          weight: 'regular',
          density: 0.5,
          sizeMin: 0.2,
          sizeMax: 0.03,
          rotate: true,
          grain: 0.08,
          colors: null,
        },
      };
      const result = themeSpecSchema.safeParse(spec);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({ path: [path, 'sizeMin'] }),
        );
      }
    },
  );

  it('rejects gradient icons without an end colour', () => {
    const spec = sampleSpec();
    spec.icons.fill = 'gradient';
    const result = themeSpecSchema.safeParse(spec);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ['icons', 'bg2'] }),
      );
    }
  });

  it('accepts gradient icons with an end colour', () => {
    const spec = sampleSpec();
    spec.icons.fill = 'gradient';
    spec.icons.bg2 = '#ff8b58';
    expect(themeSpecSchema.safeParse(spec).success).toBe(true);
  });

  it.each(['lockWallpaper', 'bg2', 'border', 'sticker', 'colors'])(
    'requires explicit null instead of an omitted %s',
    (key) => {
      const spec = sampleSpec();
      const input =
        key === 'lockWallpaper'
          ? { ...spec, lockWallpaper: undefined }
          : key === 'colors'
            ? { ...spec, wallpaper: { ...spec.wallpaper, colors: undefined } }
            : { ...spec, icons: { ...spec.icons, [key]: undefined } };
      expect(themeSpecSchema.safeParse(input).success).toBe(false);
    },
  );

  it('rejects unsupported spec versions and too many decorations', () => {
    expect(themeSpecSchema.safeParse({ ...sampleSpec(), v: 2 }).success).toBe(false);
    expect(
      themeSpecSchema.safeParse({ ...sampleSpec(), decor: Array(7).fill('sparkle') }).success,
    ).toBe(false);
  });
});

describe('spec primitives', () => {
  it('accepts documented numeric endpoints', () => {
    expect(Seed.parse(0)).toBe(0);
    expect(Seed.parse(2_147_483_647)).toBe(2_147_483_647);
    expect(Unit.parse(0)).toBe(0);
    expect(Unit.parse(1)).toBe(1);
    expect(Hex.parse('#ABCDEF')).toBe('#abcdef');
    expect(GlyphName.parse('moon-stars')).toBe('moon-stars');
  });

  it.each([-1, 2_147_483_648, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid seed %s',
    (seed) => expect(Seed.safeParse(seed).success).toBe(false),
  );

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid unit value %s',
    (value) => expect(Unit.safeParse(value).success).toBe(false),
  );

  it('only accepts wallpaper full-image object keys', () => {
    const key = 'uploads/wallpapers/12345678-1234-1234-1234-123456789abc/full.jpg';
    expect(AssetKey.parse(key)).toBe(key);
    expect(AssetKey.safeParse(`${key}?download=1`).success).toBe(false);
    expect(AssetKey.safeParse('https://example.com/full.jpg').success).toBe(false);
    expect(AssetKey.safeParse(key.replace('full.jpg', '../full.jpg')).success).toBe(false);
  });
});

describe('wallpaper variants', () => {
  it.each([
    { kind: 'mesh', seed: 0, points: 3, softness: 0, grain: 0, colors: null },
    { kind: 'blobs', seed: 0, count: 3, blur: 0, grain: 0, colors: null },
    { kind: 'waves', seed: 0, layers: 2, amplitude: 0, frequency: 0, grain: 0, colors: null },
    { kind: 'pattern', pattern: 'bows', scale: 0.5, rotation: -45, colors: null },
    {
      kind: 'scatter',
      seed: 0,
      glyphs: ['sparkle'],
      weight: 'duotone',
      density: 0,
      sizeMin: 0.02,
      sizeMax: 0.03,
      rotate: false,
      grain: 0,
      colors: null,
    },
    { kind: 'aurora', seed: 0, bands: 2, grain: 0, colors: null },
    { kind: 'sky', seed: 0, mode: 'day', clouds: 0, stars: 0, moon: false, grain: 0, colors: null },
    { kind: 'shapes', seed: 0, density: 0, grain: 0, colors: null },
    {
      kind: 'image',
      assetKey: 'uploads/wallpapers/12345678-1234-1234-1234-123456789abc/full.jpg',
      focalX: 0,
      focalY: 1,
      dim: 0.6,
    },
  ])('accepts the $kind variant', (wallpaper) => {
    expect(wallpaperSchema.safeParse(wallpaper).success).toBe(true);
  });

  it('rejects missing variants and palette overrides outside the supported range', () => {
    expect(wallpaperSchema.safeParse({ kind: 'unsupported' }).success).toBe(false);
    const wallpaper = sampleSpec().wallpaper;
    expect(wallpaperSchema.safeParse({ ...wallpaper, colors: ['#ffffff'] }).success).toBe(false);
    expect(
      wallpaperSchema.safeParse({ ...wallpaper, colors: Array(7).fill('#ffffff') }).success,
    ).toBe(false);
  });
});
