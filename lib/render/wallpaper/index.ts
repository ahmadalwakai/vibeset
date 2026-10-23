import { deriveWallpaperColors } from '../palette';
import { createRng } from '../prng';
import { idFactory, svgDocument } from '../svg';
import { renderAurora } from './aurora';
import { renderBlobs } from './blobs';
import { renderImage } from './image';
import { renderMesh } from './mesh';
import { renderPattern } from './pattern';
import { renderScatter } from './scatter';
import { renderShapes } from './shapes';
import { renderSky } from './sky';
import { renderWaves } from './waves';
import { clamp } from './context';
import type { ThemeSpec } from '../spec';
import type { GlyphSource, RenderDimensions, RenderResult } from '../types';
import type { WallpaperContext, WallpaperLayer } from './context';

export function renderWallpaper(
  spec: ThemeSpec,
  which: 'home' | 'lock',
  options: RenderDimensions,
  glyphs: GlyphSource,
): RenderResult {
  const wallpaper = which === 'lock' ? (spec.lockWallpaper ?? spec.wallpaper) : spec.wallpaper;
  const w = clamp(options.w, 1, 16_384);
  const h = clamp(options.h, 1, 16_384);
  const seed = 'seed' in wallpaper ? wallpaper.seed : 0;
  const warnings: string[] = [];
  const ctx: WallpaperContext = {
    w,
    h,
    palette: spec.palette,
    colors:
      ('colors' in wallpaper ? wallpaper.colors : null) ??
      deriveWallpaperColors(spec.palette, wallpaper.kind),
    rng: createRng(seed),
    id: idFactory(options.prefix ?? `wallpaper-${wallpaper.kind}-${seed}`),
    glyphs,
    warnings,
  };
  let layer: WallpaperLayer;
  switch (wallpaper.kind) {
    case 'mesh':
      layer = renderMesh(wallpaper, ctx);
      break;
    case 'blobs':
      layer = renderBlobs(wallpaper, ctx);
      break;
    case 'waves':
      layer = renderWaves(wallpaper, ctx);
      break;
    case 'pattern':
      layer = renderPattern(wallpaper, ctx);
      break;
    case 'scatter':
      layer = renderScatter(wallpaper, ctx);
      break;
    case 'aurora':
      layer = renderAurora(wallpaper, ctx);
      break;
    case 'sky':
      layer = renderSky(wallpaper, ctx);
      break;
    case 'shapes':
      layer = renderShapes(wallpaper, ctx);
      break;
    case 'image':
      layer = renderImage(wallpaper, ctx);
      break;
  }
  return {
    svg: svgDocument({ w, h, ...layer }),
    width: w,
    height: h,
    grain: 'grain' in wallpaper ? clamp(wallpaper.grain) : 0,
    noiseSeed: seed,
    warnings,
    ...(wallpaper.kind === 'image'
      ? {
          background: {
            kind: 'image' as const,
            assetKey: wallpaper.assetKey,
            focalX: clamp(wallpaper.focalX),
            focalY: clamp(wallpaper.focalY),
            dim: clamp(wallpaper.dim, 0, 0.6),
          },
        }
      : {}),
  };
}
