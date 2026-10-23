import { mixOklab } from '../color';
import { catmullRomPath } from '../geometry';
import { fmt } from '../svg';
import { blurFilter, clamp, colorAt } from './context';
import type { WallpaperSpec } from '../spec';
import type { WallpaperContext, WallpaperLayer } from './context';

export function renderAurora(
  spec: Extract<WallpaperSpec, { kind: 'aurora' }>,
  ctx: WallpaperContext,
): WallpaperLayer {
  const { w, h, rng, id } = ctx;
  const blur = id('aurora-blur');
  let defs = blurFilter(blur, w, h, rng.range(0.05, 0.1) * w);
  let bands = '';
  for (let i = 0; i < Math.round(clamp(spec.bands, 2, 5)); i += 1) {
    const gradient = id('aurora-band');
    const color = colorAt(ctx.colors, i + 1);
    defs += `<linearGradient id="${gradient}" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${color}" stop-opacity="0"/><stop offset="0.45" stop-color="${color}" stop-opacity="0.95"/><stop offset="1" stop-color="${colorAt(ctx.colors, i + 2)}" stop-opacity="0.12"/></linearGradient>`;
    const y = h * (0.25 + i * 0.12);
    const points = [
      { x: -w * 0.2, y: y + rng.range(0.1, 0.4) * h },
      { x: w * 0.18, y: y - rng.range(0, 0.15) * h },
      { x: w * 0.6, y: y + rng.range(0, 0.22) * h },
      { x: w * 1.2, y: y - rng.range(0, 0.2) * h },
    ];
    bands += `<path d="${catmullRomPath(points)}" fill="none" stroke="url(#${gradient})" stroke-width="${fmt(rng.range(0.09, 0.2) * w)}" stroke-linecap="round"/>`;
  }
  let stars = '';
  if (ctx.palette.mode === 'dark') {
    for (let i = 0; i < 44; i += 1)
      stars += `<circle cx="${fmt(rng.range(0, w))}" cy="${fmt(rng.range(0, h * 0.8))}" r="${fmt(rng.range(0.0007, 0.0018) * w)}" fill="${ctx.palette.ink}" opacity="${fmt(rng.range(0.12, 0.45))}"/>`;
  }
  return {
    defs,
    body: `<rect width="${fmt(w)}" height="${fmt(h)}" fill="${mixOklab(colorAt(ctx.colors, 0), '#05111d', 0.86)}"/><g filter="url(#${blur})">${bands}</g>${stars}`,
  };
}
