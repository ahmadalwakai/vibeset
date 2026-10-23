import { mixOklab } from '../color';
import { poissonDisk } from '../geometry';
import { fmt } from '../svg';
import { blurFilter, clamp, colorAt } from './context';
import type { WallpaperSpec } from '../spec';
import type { WallpaperContext, WallpaperLayer } from './context';

export function renderSky(
  spec: Extract<WallpaperSpec, { kind: 'sky' }>,
  ctx: WallpaperContext,
): WallpaperLayer {
  const { w, h, rng, id } = ctx;
  const gradient = id('sky-gradient');
  const cloudBlur = id('cloud-blur');
  const night = spec.mode === 'night';
  const bg = colorAt(ctx.colors, 0);
  const primary = colorAt(ctx.colors, 1);
  const accent = colorAt(ctx.colors, 2);
  const surface = colorAt(ctx.colors, 3);
  const top = night
    ? mixOklab(bg, '#081128', 0.88)
    : spec.mode === 'sunset'
      ? accent
      : mixOklab(primary, surface, 0.15);
  const bottom = night ? mixOklab(primary, '#15132e', 0.85) : spec.mode === 'sunset' ? bg : surface;
  let defs = `<linearGradient id="${gradient}" x2="0" y2="1"><stop stop-color="${top}"/><stop offset="0.52" stop-color="${spec.mode === 'sunset' ? primary : mixOklab(top, bottom, 0.5)}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>${blurFilter(cloudBlur, w, h, w * 0.012)}`;
  let body = `<rect width="${fmt(w)}" height="${fmt(h)}" fill="url(#${gradient})"/>`;
  if (night && spec.stars > 0) {
    const points = poissonDisk({
      w,
      h: h * 0.88,
      minDistance: w * 0.035,
      maxPoints: Math.round(clamp(spec.stars) * 160),
      rng,
    });
    for (const point of points)
      body += `<circle cx="${fmt(point.x)}" cy="${fmt(point.y)}" r="${fmt(rng.range(0.0008, 0.0027) * w)}" fill="#ffffff" opacity="${fmt(rng.range(0.3, 0.9))}"/>`;
  }
  if (night && spec.moon) {
    const moon = id('crescent');
    const cx = w * 0.76;
    const cy = h * 0.29;
    const radius = w * 0.075;
    defs += `<mask id="${moon}" maskUnits="userSpaceOnUse" x="${fmt(cx - radius)}" y="${fmt(cy - radius)}" width="${fmt(radius * 2)}" height="${fmt(radius * 2)}"><circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(radius)}" fill="#ffffff"/><circle cx="${fmt(cx + radius * 0.45)}" cy="${fmt(cy - radius * 0.22)}" r="${fmt(radius * 0.92)}" fill="#000000"/></mask>`;
    body += `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(radius)}" fill="${mixOklab(surface, '#ffffff', 0.65)}" mask="url(#${moon})"/>`;
  }
  const clouds = Math.round(clamp(spec.clouds) * 10);
  let cloudShapes = '';
  for (let i = 0; i < clouds; i += 1) {
    const cx = rng.range(0.1, 0.9) * w;
    const cy = rng.range(0.34, 0.95) * h;
    const radius = rng.range(0.11, 0.23) * w;
    for (let j = 0; j < 5; j += 1) {
      const x = cx + (j - 2) * radius * 0.45;
      const y = cy - Math.sin((j / 4) * Math.PI) * radius * 0.26;
      const rx = radius * rng.range(0.6, 0.9);
      const ry = radius * rng.range(0.28, 0.45);
      const opacity = night ? 0.1 : rng.range(0.22, 0.38);
      // resvg 2.6 cannot blur a child whose bounds miss the output canvas entirely.
      if (x + rx <= 0.01 || x - rx >= w - 0.01 || y + ry <= 0.01 || y - ry >= h - 0.01) continue;
      cloudShapes += `<ellipse cx="${fmt(x)}" cy="${fmt(y)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${night ? primary : '#ffffff'}" opacity="${fmt(opacity)}"/>`;
    }
  }
  return { defs, body: body + `<g filter="url(#${cloudBlur})">${cloudShapes}</g>` };
}
