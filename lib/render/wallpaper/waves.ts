import { mixOklab } from '../color';
import { catmullRomPath } from '../geometry';
import { fmt } from '../svg';
import { clamp, colorAt } from './context';
import type { WallpaperSpec } from '../spec';
import type { WallpaperContext, WallpaperLayer } from './context';

export function renderWaves(
  spec: Extract<WallpaperSpec, { kind: 'waves' }>,
  ctx: WallpaperContext,
): WallpaperLayer {
  const { w, h, rng } = ctx;
  let body = `<rect width="${fmt(w)}" height="${fmt(h)}" fill="${colorAt(ctx.colors, 0)}"/>`;
  const layers = Math.round(clamp(spec.layers, 2, 6));
  for (let i = 0; i < layers; i += 1) {
    const phase = rng.range(0, Math.PI * 2);
    const phase2 = rng.range(0, Math.PI * 2);
    const cycles = 1 + clamp(spec.frequency) * 2;
    const amplitude = clamp(spec.amplitude) * 0.08 * h;
    const baseline = h * (0.45 + (i / layers) * 0.44);
    const points = Array.from({ length: 25 }, (_, j) => {
      const t = j / 24;
      return {
        x: t * w,
        y:
          baseline +
          Math.sin(t * Math.PI * 2 * cycles + phase) * amplitude +
          Math.sin(t * Math.PI * 4 * cycles + phase2) * amplitude * 0.35,
      };
    });
    const color = mixOklab(colorAt(ctx.colors, 2), colorAt(ctx.colors, 3), i / (layers - 1));
    body += `<path d="${catmullRomPath(points)}L${fmt(w)} ${fmt(h)}H0Z" fill="${color}"/>`;
  }
  return { body };
}
