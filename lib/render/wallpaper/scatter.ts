import { poissonDisk } from '../geometry';
import { placeGlyph, resolveGlyph } from '../glyphs';
import { fmt } from '../svg';
import { clamp, colorAt } from './context';
import type { WallpaperSpec } from '../spec';
import type { WallpaperContext, WallpaperLayer } from './context';

export function renderScatter(
  spec: Extract<WallpaperSpec, { kind: 'scatter' }>,
  ctx: WallpaperContext,
): WallpaperLayer {
  const { w, h, rng, id } = ctx;
  const base = id('scatter-base');
  const defs = `<linearGradient id="${base}" x2="0.6" y2="1"><stop stop-color="${colorAt(ctx.colors, 0)}"/><stop offset="1" stop-color="${colorAt(ctx.colors, 1)}"/></linearGradient>`;
  const minimum = clamp(spec.sizeMin, 0.02, 0.2);
  const maximum = Math.max(minimum, clamp(spec.sizeMax, 0.03, 0.35));
  const positions = poissonDisk({
    w,
    h,
    minDistance: maximum * w * 1.05,
    maxPoints: Math.round(8 + clamp(spec.density) * 52),
    rng,
  });
  let symbols = '';
  for (const point of positions) {
    if (point.y < h * 0.22 && rng.chance(0.72)) continue;
    const size = rng.range(minimum, maximum) * w;
    const name = spec.glyphs.length ? rng.pick(spec.glyphs) : 'circle';
    const markup = resolveGlyph(ctx.glyphs, name, spec.weight, ctx.warnings);
    symbols += `<g opacity="${fmt(rng.range(0.7, 1))}">${placeGlyph({ markup, x: point.x - size / 2, y: point.y - size / 2, size, color: colorAt(ctx.colors, rng.int(1, Math.max(1, ctx.colors.length - 1))), rotate: spec.rotate ? rng.range(-25, 25) : 0 })}</g>`;
  }
  return {
    defs,
    body: `<rect width="${fmt(w)}" height="${fmt(h)}" fill="url(#${base})"/>${symbols}`,
  };
}
