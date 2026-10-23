import { z } from 'zod';

export const GLYPH_WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'] as const;
export const FONT_IDS = [
  'readex-pro',
  'fraunces',
  'pacifico',
  'space-grotesk',
  'el-messiri',
  'jetbrains-mono',
] as const;
export const PATTERNS = [
  'checker',
  'gingham',
  'dots',
  'stripes',
  'grid',
  'y2k-grid',
  'hearts',
  'stars',
  'bows',
  'leopard',
] as const;

export const Hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((v) => v.toLowerCase());
export const GlyphName = z.string().regex(/^[a-z0-9-]{1,48}$/);
export const Seed = z.number().int().min(0).max(2_147_483_647);
export const Unit = z.number().min(0).max(1);
export const AssetKey = z.string().regex(/^uploads\/wallpapers\/[0-9a-f-]{36}\/full\.jpg$/);
const Colors = z.array(Hex).min(2).max(6).nullable(); // null = derive from palette

export const paletteSchema = z.object({
  mode: z.enum(['light', 'dark']),
  bg: Hex,
  surface: Hex,
  primary: Hex,
  accent: Hex,
  ink: Hex,
  inkMuted: Hex,
});

export const wallpaperSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('mesh'),
    seed: Seed,
    points: z.number().int().min(3).max(7),
    softness: Unit,
    grain: Unit,
    colors: Colors,
  }),
  z.object({
    kind: z.literal('blobs'),
    seed: Seed,
    count: z.number().int().min(3).max(9),
    blur: Unit,
    grain: Unit,
    colors: Colors,
  }),
  z.object({
    kind: z.literal('waves'),
    seed: Seed,
    layers: z.number().int().min(2).max(6),
    amplitude: Unit,
    frequency: Unit,
    grain: Unit,
    colors: Colors,
  }),
  z.object({
    kind: z.literal('pattern'),
    pattern: z.enum(PATTERNS),
    scale: z.number().min(0.5).max(3),
    rotation: z.number().min(-45).max(45),
    colors: Colors,
  }),
  z.object({
    kind: z.literal('scatter'),
    seed: Seed,
    glyphs: z.array(GlyphName).min(1).max(6),
    weight: z.enum(GLYPH_WEIGHTS),
    density: Unit,
    sizeMin: z.number().min(0.02).max(0.2),
    sizeMax: z.number().min(0.03).max(0.35),
    rotate: z.boolean(),
    grain: Unit,
    colors: Colors,
  }),
  z.object({
    kind: z.literal('aurora'),
    seed: Seed,
    bands: z.number().int().min(2).max(5),
    grain: Unit,
    colors: Colors,
  }),
  z.object({
    kind: z.literal('sky'),
    seed: Seed,
    mode: z.enum(['day', 'sunset', 'night']),
    clouds: Unit,
    stars: Unit,
    moon: z.boolean(),
    grain: Unit,
    colors: Colors,
  }),
  z.object({ kind: z.literal('shapes'), seed: Seed, density: Unit, grain: Unit, colors: Colors }),
  z.object({
    kind: z.literal('image'),
    assetKey: AssetKey,
    focalX: Unit,
    focalY: Unit,
    dim: z.number().min(0).max(0.6),
  }),
]);

export const iconStyleSchema = z.object({
  shape: z.enum(['squircle', 'circle', 'rounded', 'square']), // Android/desktop exports only; iOS is always full-bleed
  fill: z.enum(['solid', 'gradient', 'glass', 'outline', 'pattern', 'wallpaper']),
  bg: Hex,
  bg2: Hex.nullable(), // gradient end colour
  glyphColor: Hex,
  glyphWeight: z.enum(GLYPH_WEIGHTS),
  glyphScale: z.number().min(0.4).max(0.7),
  border: z.object({ width: z.number().min(0).max(0.08), color: Hex }).nullable(),
  sticker: z
    .object({ glyph: GlyphName, color: Hex, corner: z.enum(['tl', 'tr', 'bl', 'br']) })
    .nullable(),
  shadow: z.boolean(),
});

export const widgetStyleSchema = z.object({
  style: z.enum(['glass', 'solid', 'outline', 'paper']),
  radius: z.number().min(0).max(0.5),
  surface: Hex,
  ink: Hex,
  accent: Hex,
});

export const typographySchema = z.object({ display: z.enum(FONT_IDS), body: z.enum(FONT_IDS) });

export const themeSpecSchema = z
  .object({
    v: z.literal(1),
    palette: paletteSchema,
    wallpaper: wallpaperSchema,
    lockWallpaper: wallpaperSchema.nullable(), // null = same as wallpaper
    icons: iconStyleSchema,
    widgets: widgetStyleSchema,
    type: typographySchema,
    decor: z.array(GlyphName).max(6),
  })
  .superRefine((spec, ctx) => {
    for (const [path, w] of [
      ['wallpaper', spec.wallpaper],
      ['lockWallpaper', spec.lockWallpaper],
    ] as const) {
      if (w?.kind === 'scatter' && w.sizeMin > w.sizeMax) {
        ctx.addIssue({
          code: 'custom',
          path: [path, 'sizeMin'],
          message: 'sizeMin must be ≤ sizeMax',
        });
      }
    }
    if (spec.icons.fill === 'gradient' && !spec.icons.bg2) {
      ctx.addIssue({ code: 'custom', path: ['icons', 'bg2'], message: 'gradient fill needs bg2' });
    }
  });

export type ThemeSpec = z.infer<typeof themeSpecSchema>;
export type WallpaperSpec = z.infer<typeof wallpaperSchema>;
export type IconStyle = z.infer<typeof iconStyleSchema>;
