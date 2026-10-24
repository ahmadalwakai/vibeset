import { z } from 'zod';
import {
  MAX_CUSTOM_ICONS,
  MAX_ICON_EXPORT_BYTES,
  MAX_ICON_EXPORT_FILES,
  MAX_SELECTED_APPS,
} from '../icon-export';
import type { ExportIconsInput, IconExportWarning, IconRenderContext } from '../icon-export';
import { themeSpecSchema } from '../render/spec';
import type { renderIcon } from '../render/icon';
import type { RenderResult, WidgetKind } from '../render/types';
import {
  appDtoSchema,
  customIconSchema,
  exportSlugSchema,
  glyphNameSchema,
} from '../validation/icon-export';
import { loadGlyphs } from './glyphs';
import { chunk, fileNameFor, wallpaperGlyphWeights } from './icon-export-utils';

type IconRenderer = typeof renderIcon;
const renderers = new WeakMap<IconRenderContext, IconRenderer>();
const platformSchema = z.enum(['ios', 'shaped']);
const exportSchema = z
  .object({
    slug: exportSlugSchema,
    spec: themeSpecSchema,
    apps: z.array(appDtoSchema).max(MAX_SELECTED_APPS),
    custom: z.array(customIconSchema).max(MAX_CUSTOM_ICONS),
    platform: platformSchema,
    decor: z.boolean().optional(),
  })
  .refine(
    ({ apps, custom, decor }) => apps.length + custom.length > 0 || decor === true,
    'Select at least one icon or decor widget',
  );
const widgets: readonly { kind: WidgetKind; w: number; h: number }[] = [
  { kind: 'glyphBadge', w: 512, h: 512 },
  { kind: 'ring', w: 512, h: 512 },
  { kind: 'stickerCollage', w: 1024, h: 482 },
  { kind: 'photoFrame', w: 1024, h: 1072 },
];

export async function prepareIconRenderContext({
  spec: input,
  signal,
}: {
  spec: IconRenderContext['spec'];
  signal?: AbortSignal;
}): Promise<IconRenderContext> {
  signal?.throwIfAborted();
  const spec = themeSpecSchema.parse(input);
  const weights = new Set([spec.icons.glyphWeight]);
  if (spec.icons.fill === 'wallpaper')
    for (const weight of wallpaperGlyphWeights(spec.wallpaper)) weights.add(weight);
  const [iconModule, sources] = await Promise.all([
    import('../render/icon'),
    Promise.all([...weights].map((weight) => loadGlyphs(weight, signal))),
  ]);
  signal?.throwIfAborted();
  const glyphs = sources[0];
  if (!glyphs) throw new Error('Glyph source is unavailable');
  let icons = spec.icons;
  let wallpaper: RenderResult | undefined;
  const warnings: IconExportWarning[] = [];
  if (icons.fill === 'wallpaper') {
    if (spec.wallpaper.kind === 'image') {
      const { resolveIconColours } = await import('../render/icon-colors');
      const colours = resolveIconColours('gradient', spec.palette) ?? {
        bg: spec.palette.primary,
        bg2: spec.palette.accent,
        glyphColor: spec.palette.ink,
      };
      icons = { ...icons, ...colours, fill: 'gradient' };
      warnings.push('photo-wallpaper-fallback');
    } else {
      const { renderWallpaper } = await import('../render/wallpaper');
      wallpaper = renderWallpaper(
        spec,
        'home',
        { w: 1320, h: 2868, prefix: 'export-wallpaper' },
        glyphs,
      );
      if (wallpaper.warnings.length) warnings.push('missing-glyph');
    }
  }
  signal?.throwIfAborted();
  const context: IconRenderContext = { spec, icons, glyphs, wallpaper, warnings };
  renderers.set(context, iconModule.renderIcon);
  return context;
}

export function renderIconPreview({
  context,
  glyph,
  platform,
  size = 64,
}: {
  context: IconRenderContext;
  glyph: string;
  platform: 'ios' | 'shaped';
  size?: number;
}): RenderResult {
  const renderer = renderers.get(context);
  if (!renderer) throw new TypeError('Prepare the icon render context before rendering');
  const name = glyphNameSchema.parse(glyph);
  const validSize = z.number().int().min(8).max(512).parse(size);
  return renderer(context.icons, context.glyphs.get(name, context.icons.glyphWeight), {
    size: validSize,
    platform: platformSchema.parse(platform),
    palette: context.spec.palette,
    glyphs: context.glyphs,
    wallpaper: context.wallpaper,
    prefix: `export-${name}`,
  });
}

async function yieldToBrowser(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const scheduler: unknown = Reflect.get(globalThis, 'scheduler');
  if (
    typeof scheduler === 'object' &&
    scheduler !== null &&
    'yield' in scheduler &&
    typeof scheduler.yield === 'function'
  )
    await scheduler.yield();
  else await new Promise<void>((resolve) => setTimeout(resolve, 0));
  signal?.throwIfAborted();
}

export async function exportIcons(input: ExportIconsInput): Promise<File[]> {
  input.signal?.throwIfAborted();
  const parsed = exportSchema.parse(input);
  const entries = [
    ...parsed.apps.map((app) => ({ id: app.slug, glyph: app.glyph })),
    ...parsed.custom.map((icon) => ({ id: icon.id, glyph: icon.glyph })),
  ];
  const names = [
    ...entries.map(({ id }) => fileNameFor(parsed.slug, id)),
    ...(parsed.decor
      ? widgets.map(({ kind }) => fileNameFor(parsed.slug, `widget-${kind.toLowerCase()}`))
      : []),
  ];
  if (names.length > MAX_ICON_EXPORT_FILES || new Set(names).size !== names.length)
    throw new TypeError('Icon export filenames must be unique and within the file limit');
  const { signal, onProgress, onWarning } = input;
  const reported = new Set<IconExportWarning>();
  const warn = (warning: IconExportWarning): void => {
    signal?.throwIfAborted();
    if (!reported.has(warning)) {
      reported.add(warning);
      onWarning?.(warning);
    }
  };
  onProgress?.({ completed: 0, total: names.length });
  const [context, rasterizer, widgetModule] = await Promise.all([
    prepareIconRenderContext({ spec: parsed.spec, signal }),
    import('./rasterize'),
    parsed.decor ? import('../render/widgets') : Promise.resolve(undefined),
  ]);
  signal?.throwIfAborted();
  for (const warning of context.warnings) warn(warning);
  const jobs = [
    ...entries.map(({ glyph }, index) => ({
      name: names[index],
      w: 512,
      h: 512,
      render: (): RenderResult =>
        renderIconPreview({ context, glyph, platform: parsed.platform, size: 512 }),
    })),
    ...(parsed.decor && widgetModule
      ? widgets.map(({ kind, w, h }, index) => ({
          name: names[entries.length + index],
          w,
          h,
          render: (): RenderResult =>
            widgetModule.renderWidget(kind, context.spec, { w, h }, context.glyphs),
        }))
      : []),
  ];
  const files: File[] = [];
  let bytes = 0;
  try {
    for (const [batchIndex, batch] of chunk(jobs, 6).entries()) {
      if (batchIndex > 0) await yieldToBrowser(signal);
      for (const job of batch) {
        signal?.throwIfAborted();
        if (!job.name) throw new Error('Export filename is unavailable');
        const result = job.render();
        if (result.warnings.length) warn('missing-glyph');
        const blob = await rasterizer.rasterizeInBrowser(result, {
          w: job.w,
          h: job.h,
          type: 'image/png',
          signal,
        });
        signal?.throwIfAborted();
        bytes += blob.size;
        if (!blob.size || blob.type !== 'image/png' || bytes > MAX_ICON_EXPORT_BYTES)
          throw new RangeError('Icon export exceeds the file budget or contains an invalid PNG');
        files.push(new File([blob], job.name, { type: 'image/png' }));
        onProgress?.({ completed: files.length, total: names.length });
      }
    }
    signal?.throwIfAborted();
    return files;
  } catch (error) {
    files.length = 0;
    throw error;
  }
}
