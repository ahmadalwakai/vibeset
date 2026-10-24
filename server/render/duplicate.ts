import 'server-only';

import { renderWallpaper } from '../../lib/render/wallpaper';
import type { ThemeSpec } from '../../lib/render/spec';
import type { GlyphSource } from '../../lib/render/types';
import { dHash } from './hash';
import { rasterize } from './rasterize';

/** Canonical duplicate fingerprint: the home wallpaper without fixed preview chrome or icons. */
export async function fingerprintWallpaper(
  spec: ThemeSpec,
  glyphs: GlyphSource,
  focalBackground?: Uint8Array,
): Promise<string> {
  const dimensions = { w: 72, h: 156 };
  const bytes = await rasterize(renderWallpaper(spec, 'home', dimensions, glyphs), {
    ...dimensions,
    format: 'png',
    focalBackground,
  });
  return dHash(bytes);
}
