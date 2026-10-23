import { catmullRomPath } from '../geometry';
import { fmt } from '../svg';
import { blurFilter, clamp, colorAt } from './context';
import type { WallpaperSpec } from '../spec';
import type { WallpaperContext, WallpaperLayer } from './context';

export function renderBlobs(
  spec: Extract<WallpaperSpec, { kind: 'blobs' }>,
  ctx: WallpaperContext,
): WallpaperLayer {
  const { w, h, rng, id } = ctx;
  const base = id('blob-base');
  const blur = id('blob-blur');
  const defs = `<linearGradient id="${base}" x2="0.7" y2="1"><stop stop-color="${colorAt(ctx.colors, 0)}"/><stop offset="1" stop-color="${colorAt(ctx.colors, 1)}"/></linearGradient>${blurFilter(blur, w, h, clamp(spec.blur) * 0.06 * w)}`;
  let shapes = '';
  const count = Math.round(clamp(spec.count, 3, 9));
  for (let i = 0; i < count; i += 1) {
    const cx = rng.range(-0.05, 1.05) * w;
    const cy = ((i + rng.range(0.1, 0.9)) / count) * h;
    const radius = rng.range(0.3, 0.7) * w;
    const points = rng.int(6, 9);
    const rotation = rng.range(0, Math.PI * 2);
    const vertices = Array.from({ length: points }, (_, j) => {
      const angle = rotation + (j * Math.PI * 2) / points;
      const jitter = rng.range(0.7, 1.2);
      return {
        x: cx + Math.cos(angle) * radius * jitter,
        y: cy + Math.sin(angle) * radius * jitter * rng.range(0.8, 1.3),
      };
    });
    shapes += `<path d="${catmullRomPath(vertices, true)}" fill="${colorAt(ctx.colors, i + 2)}" opacity="${fmt(rng.range(0.74, 0.96))}"/>`;
  }
  return {
    defs,
    body: `<rect width="${fmt(w)}" height="${fmt(h)}" fill="url(#${base})"/><g filter="url(#${blur})">${shapes}</g>`,
  };
}
