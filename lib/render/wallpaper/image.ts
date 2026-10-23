import { fmt } from '../svg';
import { clamp } from './context';
import type { WallpaperSpec } from '../spec';
import type { WallpaperContext, WallpaperLayer } from './context';

export function renderImage(
  spec: Extract<WallpaperSpec, { kind: 'image' }>,
  ctx: WallpaperContext,
): WallpaperLayer {
  return {
    body: `<rect width="${fmt(ctx.w)}" height="${fmt(ctx.h)}" fill="#000000" opacity="${fmt(clamp(spec.dim, 0, 0.6))}"/>`,
  };
}
