import { mixOklab } from '../color';
import { catmullRomPath, poissonDisk } from '../geometry';
import { placeGlyph, resolveGlyph } from '../glyphs';
import { bowPath } from '../shapes/bow';
import { fmt } from '../svg';
import { blurFilter, clamp, colorAt } from './context';
import type { WallpaperSpec } from '../spec';
import type { WallpaperContext, WallpaperLayer } from './context';

function perspectiveGrid(ctx: WallpaperContext): WallpaperLayer {
  const { w, h, id } = ctx;
  const bg = colorAt(ctx.colors, 0);
  const primary = colorAt(ctx.colors, 1);
  const accent = colorAt(ctx.colors, 2);
  const line = ctx.palette.mode === 'light' ? mixOklab(accent, ctx.palette.ink, 0.25) : accent;
  const sky = id('y2k-sky');
  const glow = id('y2k-glow');
  const horizon = h * 0.56;
  const defs = `<linearGradient id="${sky}" x2="0" y2="1"><stop stop-color="${bg}"/><stop offset="0.56" stop-color="${mixOklab(primary, bg, 0.3)}"/><stop offset="1" stop-color="${bg}"/></linearGradient>${blurFilter(glow, w, h, w * 0.012)}`;
  let lines = '';
  for (let i = -10; i <= 10; i += 1)
    lines += `M${fmt(w / 2)} ${fmt(horizon)}L${fmt(w / 2 + i * w * 0.22)} ${fmt(h)}`;
  for (let i = 1; i <= 15; i += 1) {
    const y = horizon + (h - horizon) * (i / 15) ** 2.4;
    lines += `M0 ${fmt(y)}H${fmt(w)}`;
  }
  return {
    defs,
    body: `<rect width="${fmt(w)}" height="${fmt(h)}" fill="url(#${sky})"/><path d="M0 ${fmt(horizon)}H${fmt(w)}" stroke="${accent}" stroke-width="${fmt(w * 0.025)}" opacity="0.5" filter="url(#${glow})"/><path d="${lines}" fill="none" stroke="${line}" stroke-width="${fmt(w * 0.0015)}" opacity="0.62"/>`,
  };
}

export function renderPattern(
  spec: Extract<WallpaperSpec, { kind: 'pattern' }>,
  ctx: WallpaperContext,
): WallpaperLayer {
  if (spec.pattern === 'y2k-grid') return perspectiveGrid(ctx);
  const tile = clamp(spec.scale, 0.5, 3) * 0.12 * ctx.w;
  const half = tile / 2;
  const primary = colorAt(ctx.colors, 1);
  const accent = colorAt(ctx.colors, 2);
  let content = '';
  switch (spec.pattern) {
    case 'checker':
      content = `<path d="M0 0H${fmt(half)}V${fmt(half)}H0ZM${fmt(half)} ${fmt(half)}H${fmt(tile)}V${fmt(tile)}H${fmt(half)}Z" fill="${primary}"/>`;
      break;
    case 'gingham':
      content = `<rect width="${fmt(half)}" height="${fmt(tile)}" fill="${primary}" opacity="0.28"/><rect width="${fmt(tile)}" height="${fmt(half)}" fill="${primary}" opacity="0.28"/>`;
      break;
    case 'dots':
      content = `<g fill="${primary}"><circle cx="${fmt(tile * 0.25)}" cy="${fmt(tile * 0.25)}" r="${fmt(tile * 0.07)}"/><circle cx="${fmt(tile * 0.75)}" cy="${fmt(tile * 0.75)}" r="${fmt(tile * 0.07)}"/></g>`;
      break;
    case 'stripes':
      content = `<rect width="${fmt(tile * 0.42)}" height="${fmt(tile)}" fill="${primary}" opacity="0.8"/>`;
      break;
    case 'grid':
      content = `<path d="M0 0H${fmt(tile)}M0 0V${fmt(tile)}" fill="none" stroke="${primary}" stroke-width="${fmt(tile * 0.015)}" opacity="0.4"/>`;
      break;
    case 'hearts':
    case 'stars': {
      const markup = resolveGlyph(
        ctx.glyphs,
        spec.pattern === 'hearts' ? 'heart' : 'star',
        'fill',
        ctx.warnings,
      );
      content =
        placeGlyph({
          markup,
          x: tile * 0.08,
          y: tile * 0.08,
          size: tile * 0.33,
          color: primary,
          rotate: -12,
        }) +
        placeGlyph({
          markup,
          x: tile * 0.58,
          y: tile * 0.58,
          size: tile * 0.25,
          color: accent,
          rotate: 15,
        });
      break;
    }
    case 'bows':
      content = `<path d="${bowPath(tile * 0.05, tile * 0.04, tile * 0.75)}" fill="${primary}"/><circle cx="${fmt(tile * 0.9)}" cy="${fmt(tile * 0.86)}" r="${fmt(tile * 0.025)}" fill="${accent}"/>`;
      break;
    case 'leopard': {
      const positions = poissonDisk({
        w: tile,
        h: tile,
        minDistance: tile * 0.24,
        maxPoints: 14,
        rng: ctx.rng,
      });
      for (const point of positions) {
        const radius = ctx.rng.range(0.07, 0.14) * tile;
        const points = Array.from({ length: 7 }, (_, i) => {
          const angle = (i * Math.PI * 2) / 7;
          const jitter = ctx.rng.range(0.75, 1.2);
          return {
            x: point.x + Math.cos(angle) * radius * jitter,
            y: point.y + Math.sin(angle) * radius * jitter * 0.75,
          };
        });
        content += `<path d="${catmullRomPath(points, true)}" fill="${primary}" opacity="0.65"/><path d="${catmullRomPath(points.slice(0, ctx.rng.int(4, 6)))}" fill="none" stroke="${mixOklab(primary, ctx.palette.ink, 0.65)}" stroke-width="${fmt(tile * 0.037)}" stroke-linecap="round"/>`;
      }
      break;
    }
  }
  const pattern = ctx.id(`pattern-${spec.pattern}`);
  return {
    defs: `<pattern id="${pattern}" width="${fmt(tile)}" height="${fmt(tile)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${fmt(clamp(spec.rotation, -45, 45))})">${content}</pattern>`,
    body: `<rect width="${fmt(ctx.w)}" height="${fmt(ctx.h)}" fill="${colorAt(ctx.colors, 0)}"/><rect width="${fmt(ctx.w)}" height="${fmt(ctx.h)}" fill="url(#${pattern})"/>`,
  };
}
