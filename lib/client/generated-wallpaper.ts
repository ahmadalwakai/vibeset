import { z } from 'zod';
import type { WallpaperDownloadDTO } from '../dto';
import { DEVICE_PRESETS } from '../render/devices';
import { themeSpecSchema } from '../render/spec';
import type { ThemeSpec } from '../render/spec';
import { exportSlugSchema } from '../validation/icon-export';
import { MAX_WALLPAPER_BYTES, MAX_WALLPAPER_PIXELS, MAX_WALLPAPER_SIDE } from '../wallpaper-export';
import type { ScreenSizeInput, WallpaperDimensions, WallpaperOption } from '../wallpaper-export';
import { loadGlyphs } from './glyphs';
import { wallpaperGlyphWeights } from './icon-export-utils';
import { prepareWallpaperFile } from './wallpaper';

const renderOptionSchema = z
  .object({
    kind: z.literal('render'),
    size: z.enum(['phone', 'tablet', 'desktop', 'desktop4k', 'screen']),
    w: z.number().int().positive().max(MAX_WALLPAPER_SIDE),
    h: z.number().int().positive().max(MAX_WALLPAPER_SIDE),
  })
  .refine(({ w, h }) => w * h <= MAX_WALLPAPER_PIXELS, 'Wallpaper exceeds the pixel limit');
const screenSchema = z.object({
  width: z.number().finite().positive().max(1_000_000),
  height: z.number().finite().positive().max(1_000_000),
  pixelRatio: z.number().finite().positive().max(100),
});

export function screenDimensions(input: ScreenSizeInput): WallpaperDimensions {
  const { width, height, pixelRatio } = screenSchema.parse(input);
  const w = Math.max(1, Math.round(width * pixelRatio));
  const h = Math.max(1, Math.round(height * pixelRatio));
  const scale = Math.min(
    1,
    Math.sqrt(MAX_WALLPAPER_PIXELS / (w * h)),
    MAX_WALLPAPER_SIDE / w,
    MAX_WALLPAPER_SIDE / h,
  );
  return { w: Math.max(1, Math.floor(w * scale)), h: Math.max(1, Math.floor(h * scale)) };
}

/** Omitting stored files enables spec mode; an explicit array retains published-file availability. */
export function createWallpaperOptions({
  spec: input,
  wallpapers,
  screen,
}: {
  spec: ThemeSpec;
  wallpapers?: readonly WallpaperDownloadDTO[];
  screen?: WallpaperDimensions;
}): WallpaperOption[] {
  const spec = themeSpecSchema.parse(input);
  const generated = spec.wallpaper.kind !== 'image';
  const options: WallpaperOption[] = wallpapers
    ? wallpapers.map((asset) => ({ kind: 'cdn', asset }))
    : [];
  if (!generated) return options;
  if (!wallpapers) {
    for (const size of ['phone', 'tablet', 'desktop'] as const)
      options.push({ kind: 'render', size, ...DEVICE_PRESETS[size] });
  }
  options.push({ kind: 'render', size: 'desktop4k', ...DEVICE_PRESETS.desktop4k });
  if (screen) options.push(renderOptionSchema.parse({ kind: 'render', size: 'screen', ...screen }));
  return options;
}

export async function prepareWallpaper({
  slug,
  spec: input,
  option,
  signal,
}: {
  slug: string;
  spec: ThemeSpec;
  option: WallpaperOption;
  signal?: AbortSignal;
}): Promise<File> {
  signal?.throwIfAborted();
  const validSlug = exportSlugSchema.parse(slug);
  const spec = themeSpecSchema.parse(input);
  if (option.kind === 'cdn')
    return prepareWallpaperFile(validSlug, option.asset, signal ?? new AbortController().signal);
  const selected = renderOptionSchema.parse(option);
  if (spec.wallpaper.kind === 'image')
    throw new TypeError('Custom sizes require a generated wallpaper');
  const [{ renderWallpaper }, { rasterizeInBrowser }, sources] = await Promise.all([
    import('../render/wallpaper'),
    import('./rasterize'),
    Promise.all(wallpaperGlyphWeights(spec.wallpaper).map((weight) => loadGlyphs(weight, signal))),
  ]);
  signal?.throwIfAborted();
  const glyphs = sources[0] ?? { get: (): undefined => undefined };
  const result = renderWallpaper(
    spec,
    'home',
    { w: selected.w, h: selected.h, prefix: 'custom-wallpaper' },
    glyphs,
  );
  const blob = await rasterizeInBrowser(result, {
    w: selected.w,
    h: selected.h,
    type: 'image/jpeg',
    quality: 0.92,
    signal,
  });
  signal?.throwIfAborted();
  if (!blob.size || blob.type !== 'image/jpeg' || blob.size > MAX_WALLPAPER_BYTES)
    throw new RangeError('Generated wallpaper exceeds the file budget or is not JPEG');
  return new File([blob], `vibeset-${validSlug}-${selected.size}-${selected.w}x${selected.h}.jpg`, {
    type: 'image/jpeg',
  });
}
