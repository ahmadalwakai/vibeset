import { fmt } from '../svg';
import { clamp, colorAt } from './context';
import type { WallpaperSpec } from '../spec';
import type { WallpaperContext, WallpaperLayer } from './context';

export function renderShapes(
  spec: Extract<WallpaperSpec, { kind: 'shapes' }>,
  ctx: WallpaperContext,
): WallpaperLayer {
  const { w, h, rng } = ctx;
  let body = `<rect width="${fmt(w)}" height="${fmt(h)}" fill="${colorAt(ctx.colors, 0)}"/>`;
  const cellW = w / 3;
  const cellH = h / 6;
  const size = Math.min(cellW, cellH) * 0.9;
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (!rng.chance(clamp(spec.density))) continue;
      const x = col * cellW + (cellW - size) / 2;
      const y = row * cellH + (cellH - size) / 2;
      const radius = size / 2;
      const primitives = [
        `<circle cx="${fmt(radius)}" cy="${fmt(radius)}" r="${fmt(radius)}"/>`,
        `<path d="M0 ${fmt(radius)}A${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(size)} ${fmt(radius)}Z"/>`,
        `<path d="M0 0H${fmt(size)}A${fmt(size)} ${fmt(size)} 0 0 1 0 ${fmt(size)}Z"/>`,
        `<rect width="${fmt(size)}" height="${fmt(size)}"/>`,
        `<path d="M${fmt(radius)} 0L${fmt(size)} ${fmt(size)}H0Z"/>`,
        `<path d="M0 ${fmt(size)}V${fmt(radius)}A${fmt(radius)} ${fmt(radius)} 0 0 1 ${fmt(size)} ${fmt(radius)}V${fmt(size)}Z"/>`,
      ];
      body += `<g fill="${colorAt(ctx.colors, rng.int(1, Math.max(1, ctx.colors.length - 1)))}" transform="translate(${fmt(x)} ${fmt(y)}) rotate(${rng.int(0, 3) * 90} ${fmt(radius)} ${fmt(radius)})">${rng.pick(primitives)}</g>`;
    }
  }
  return { body };
}
