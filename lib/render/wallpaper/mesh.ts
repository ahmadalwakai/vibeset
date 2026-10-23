import { fmt } from '../svg';
import { blurFilter, clamp, colorAt } from './context';
import type { WallpaperSpec } from '../spec';
import type { WallpaperContext, WallpaperLayer } from './context';

export function renderMesh(
  spec: Extract<WallpaperSpec, { kind: 'mesh' }>,
  ctx: WallpaperContext,
): WallpaperLayer {
  const { w, h, rng, id } = ctx;
  const blur = id('mesh-blur');
  let defs = blurFilter(blur, w, h, clamp(spec.softness) * 0.08 * w);
  let clouds = '';
  const count = Math.round(clamp(spec.points, 3, 7));
  for (let i = 0; i < count; i += 1) {
    const gradient = id('mesh-color');
    const x = rng.range(-0.1, 1.1) * w;
    const y = rng.range(-0.05, 1.05) * h;
    const radius = rng.range(0.6, 1.1) * Math.max(w, h);
    const color = colorAt(ctx.colors, i + 1);
    defs += `<radialGradient id="${gradient}"><stop offset="0" stop-color="${color}" stop-opacity="0.95"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
    clouds += `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(radius)}" fill="url(#${gradient})"/>`;
  }
  return {
    defs,
    body: `<rect width="${fmt(w)}" height="${fmt(h)}" fill="${colorAt(ctx.colors, 0)}"/><g filter="url(#${blur})">${clouds}</g>`,
  };
}
