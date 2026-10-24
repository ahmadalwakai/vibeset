import 'server-only';

import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { AppDTO } from '../../lib/dto';
import { renderIcon } from '../../lib/render/icon';
import { themeSpecSchema, type ThemeSpec } from '../../lib/render/spec';
import { renderWallpaper } from '../../lib/render/wallpaper';
import { appCatalogSchema } from '../../lib/validation/icon-export';
import { loadServerGlyphs } from './glyphs';
import { rasterize } from './rasterize';

export interface RenderedNativeIcon {
  app: AppDTO;
  body: Buffer;
  sha256: string;
}

/** Generated originals only: no remote images, database or object-storage writes. */
export async function renderNativeIconPack(input: {
  spec: ThemeSpec;
  apps: readonly AppDTO[];
  signal?: AbortSignal;
}): Promise<RenderedNativeIcon[]> {
  input.signal?.throwIfAborted();
  const spec = themeSpecSchema.parse(input.spec);
  if (spec.wallpaper.kind === 'image' || spec.lockWallpaper?.kind === 'image')
    throw new TypeError('Prepared native packs require self-contained generated wallpapers');
  const entries = appCatalogSchema
    .refine((apps) => apps.length > 0 && apps.length <= 125)
    .parse(input.apps)
    .sort(
      (left, right) =>
        left.rank - right.rank || (left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0),
    );
  const glyphs = await loadServerGlyphs();
  const wallpaper =
    spec.icons.fill === 'wallpaper'
      ? renderWallpaper(spec, 'home', { w: 1320, h: 2868, prefix: 'native-pack-wallpaper' }, glyphs)
      : undefined;
  const result: RenderedNativeIcon[] = [];
  for (const app of entries) {
    input.signal?.throwIfAborted();
    const glyph = glyphs.get(app.glyph, spec.icons.glyphWeight);
    if (!glyph) throw new Error('A catalogue glyph is missing from the native pack');
    const rendered = renderIcon(spec.icons, glyph, {
      size: 512,
      platform: 'ios',
      palette: spec.palette,
      glyphs,
      wallpaper,
      prefix: `native-pack-${app.slug}`,
    });
    if (rendered.warnings.length) throw new Error('A native icon rendered with warnings');
    const png = await rasterize(rendered, { w: 512, h: 512, format: 'png' });
    input.signal?.throwIfAborted();
    if (!(await sharp(png).stats()).isOpaque) throw new Error('iOS icon PNGs must be opaque');
    const body = await sharp(png).removeAlpha().png().toBuffer();
    if (body.byteLength > 2 * 1024 * 1024)
      throw new RangeError('Native icon exceeds its byte limit');
    result.push({ app, body, sha256: createHash('sha256').update(body).digest('hex') });
  }
  return result;
}
