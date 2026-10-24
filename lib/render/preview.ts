import { z } from 'zod';
import clockData from '../../content/clock-outlines.json';
import type { CatalogApp, ClockOutline, ClockText } from '../catalog';
import { themeSpecSchema, type ThemeSpec, type WallpaperSpec } from './spec';
import type { FontId, GlyphSource, RenderDimensions, RenderLayer, RenderResult } from './types';
import { composeLayers } from './composition';
import { contrast, mixOklab } from './color';
import { placeGlyph, resolveGlyph } from './glyphs';
import { renderIcon } from './icon';
import { deriveWallpaperColors } from './palette';
import { fmt, idFactory, svgDocument, svgInner } from './svg';
import { renderWallpaper } from './wallpaper';
import { colorAt } from './wallpaper/context';
import { renderWidget } from './widgets';

const clocks: Record<FontId, Record<ClockText, ClockOutline>> = clockData;
const dimensions = z.object({
  w: z.number().min(1).max(8192),
  h: z.number().min(1).max(8192),
});

function vector(w: number, h: number, body: string, warnings: string[] = []): RenderResult {
  return {
    svg: svgDocument({ w, h, body }),
    width: w,
    height: h,
    grain: 0,
    noiseSeed: 0,
    warnings,
  };
}

function clock(
  font: FontId,
  time: ClockText,
  x: number,
  y: number,
  width: number,
  color: string,
): string {
  const outline = clocks[font][time];
  const height = (width * outline.height) / outline.width;
  return `<svg x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width)}" height="${fmt(height)}" viewBox="0 0 ${fmt(outline.width)} ${fmt(outline.height)}" color="${color}">${svgInner(outline.svg)}</svg>`;
}

function previewForeground(spec: ThemeSpec, wallpaper: WallpaperSpec): string {
  if (wallpaper.kind === 'pattern')
    return ['#000000', '#ffffff', spec.palette.ink].reduce((best, candidate) =>
      contrast(candidate, spec.palette.bg) > contrast(best, spec.palette.bg) ? candidate : best,
    );
  if (wallpaper.kind !== 'sky') {
    const estimate = mixOklab(spec.palette.bg, spec.palette.primary, 0.25);
    return contrast('#ffffff', estimate) > contrast(spec.palette.ink, estimate)
      ? '#ffffff'
      : spec.palette.ink;
  }
  const colors = wallpaper.colors ?? deriveWallpaperColors(spec.palette, wallpaper.kind);
  // Match renderSky's top gradient stop, including wrapped explicit color arrays.
  const top =
    wallpaper.mode === 'night'
      ? mixOklab(colorAt(colors, 0), '#081128', 0.88)
      : wallpaper.mode === 'sunset'
        ? colorAt(colors, 2)
        : mixOklab(colorAt(colors, 1), colorAt(colors, 3), 0.15);
  return ['#000000', '#ffffff', spec.palette.ink].reduce((best, candidate) =>
    contrast(candidate, top) > contrast(best, top) ? candidate : best,
  );
}

function frame(
  spec: ThemeSpec,
  which: 'home' | 'lock',
  w: number,
  h: number,
): {
  x: number;
  y: number;
  sw: number;
  sh: number;
  radius: number;
  foreground: string;
  statusBand: boolean;
  base: RenderResult;
} {
  const x = w * 0.045;
  const y = h * 0.025;
  const sw = w - x * 2;
  const sh = h - y * 2;
  const radius = sw * 0.105;
  const wallpaper = which === 'lock' ? (spec.lockWallpaper ?? spec.wallpaper) : spec.wallpaper;
  const foreground = previewForeground(spec, wallpaper);
  const base = vector(
    w,
    h,
    `<rect width="${fmt(w)}" height="${fmt(h)}" fill="${mixOklab(spec.palette.bg, spec.palette.surface, 0.35)}"/><rect x="${fmt(x - w * 0.012)}" y="${fmt(y - w * 0.012)}" width="${fmt(sw + w * 0.024)}" height="${fmt(sh + w * 0.024)}" rx="${fmt(radius + w * 0.012)}" fill="#17151c"/>`,
  );
  return { x, y, sw, sh, radius, foreground, statusBand: wallpaper.kind === 'pattern', base };
}

function statusScrim(
  color: string,
  screen: ReturnType<typeof frame>,
  prefix: string,
): RenderLayer[] {
  if (!screen.statusBand) return [];
  const { x, y, sw, sh, radius } = screen;
  const gradient = idFactory(prefix)('status-scrim');
  return [
    {
      result: vector(
        sw,
        sh,
        `<defs><linearGradient id="${gradient}" x2="0" y2="1"><stop stop-color="${color}"/><stop offset="0.6" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><rect width="${fmt(sw)}" height="${fmt(sh * 0.1)}" fill="url(#${gradient})"/>`,
      ),
      x,
      y,
      w: sw,
      h: sh,
      shape: 'rounded',
      radius,
    },
  ];
}

function chrome(
  glyphs: GlyphSource,
  w: number,
  h: number,
  screen: ReturnType<typeof frame>,
): RenderResult {
  const warnings: string[] = [];
  const { x, y, sw, sh, foreground } = screen;
  let body = clock('readex-pro', '9:41', x + sw * 0.075, y + sh * 0.028, sw * 0.135, foreground);
  ['cell-signal-full', 'wifi-high', 'battery-high'].forEach((name, index) => {
    body += placeGlyph({
      markup: resolveGlyph(glyphs, name, 'fill', warnings),
      x: x + sw * (0.7 + index * 0.065),
      y: y + sh * 0.023,
      size: sw * 0.05,
      color: foreground,
    });
  });
  body += `<rect x="${fmt(x + sw * 0.38)}" y="${fmt(y + sh * 0.02)}" width="${fmt(sw * 0.24)}" height="${fmt(sh * 0.017)}" rx="${fmt(sw * 0.02)}" fill="#17151c"/><rect x="${fmt(x + sw * 0.34)}" y="${fmt(y + sh * 0.975)}" width="${fmt(sw * 0.32)}" height="${fmt(sh * 0.005)}" rx="${fmt(sw * 0.008)}" fill="${foreground}" fill-opacity="0.8"/>`;
  return vector(w, h, body, warnings);
}

export function renderHomePreview(
  spec: ThemeSpec,
  glyphs: GlyphSource,
  apps: readonly CatalogApp[],
  options: RenderDimensions,
): RenderResult {
  const theme = themeSpecSchema.parse(spec);
  const { w, h } = dimensions.parse(options);
  const prefix = options.prefix ?? 'home-preview';
  const screen = frame(theme, 'home', w, h);
  const { x, y, sw, sh, radius } = screen;
  const wallpaper = renderWallpaper(
    theme,
    'home',
    { w: sw, h: sh, prefix: `${prefix}-wallpaper` },
    glyphs,
  );
  const layers: RenderLayer[] = [
    { result: screen.base, x: 0, y: 0, w, h },
    { result: wallpaper, x, y, w: sw, h: sh, shape: 'rounded', radius },
    {
      result: renderWidget(
        'stickerCollage',
        theme,
        { w: sw * 0.86, h: sh * 0.19, prefix: `${prefix}-widget` },
        glyphs,
      ),
      x: x + sw * 0.07,
      y: y + sh * 0.13,
      w: sw * 0.86,
      h: sh * 0.19,
    },
  ];
  const ranked = [...apps].sort((a, b) => a.rank - b.rank).slice(0, 16);
  let labels = '';
  ranked.forEach((app, index) => {
    const side = sw * 0.152;
    const iconX = x + sw * 0.075 + (index % 4) * sw * 0.232;
    const iconY = y + sh * (0.38 + Math.floor(index / 4) * 0.112);
    layers.push({
      result: renderIcon(theme.icons, glyphs.get(app.glyph, theme.icons.glyphWeight), {
        size: 512,
        platform: 'shaped',
        palette: theme.palette,
        glyphs,
        wallpaper,
        prefix: `${prefix}-icon-${index}`,
      }),
      x: iconX,
      y: iconY,
      w: side,
      h: side,
    });
    labels += `<rect x="${fmt(iconX + side * 0.12)}" y="${fmt(iconY + side + sh * 0.012)}" width="${fmt(side * 0.76)}" height="${fmt(sh * 0.008)}" rx="${fmt(sh * 0.004)}" fill="${screen.foreground}" fill-opacity="0.42"/>`;
  });
  const dockY = y + sh * 0.885;
  layers.push({
    result: vector(
      sw,
      sh * 0.079,
      `<rect width="${fmt(sw)}" height="${fmt(sh * 0.079)}" rx="${fmt(sw * 0.055)}" fill="${theme.widgets.surface}" fill-opacity="0.62"/>`,
    ),
    x: x + sw * 0.035,
    y: dockY,
    w: sw * 0.93,
    h: sh * 0.079,
  });
  ranked.slice(0, 4).forEach((app, index) => {
    const side = sw * 0.132;
    layers.push({
      result: renderIcon(theme.icons, glyphs.get(app.glyph, theme.icons.glyphWeight), {
        size: 512,
        platform: 'shaped',
        palette: theme.palette,
        glyphs,
        wallpaper,
        prefix: `${prefix}-dock-${index}`,
      }),
      x: x + sw * (0.105 + index * 0.217),
      y: dockY + sh * 0.011,
      w: side,
      h: side,
    });
  });
  layers.push({ result: vector(w, h, labels), x: 0, y: 0, w, h });
  layers.push(...statusScrim(theme.palette.bg, screen, prefix));
  layers.push({ result: chrome(glyphs, w, h, screen), x: 0, y: 0, w, h });
  return composeLayers(w, h, layers, prefix);
}

export function renderLockPreview(
  spec: ThemeSpec,
  glyphs: GlyphSource,
  options: RenderDimensions,
): RenderResult {
  const theme = themeSpecSchema.parse(spec);
  const { w, h } = dimensions.parse(options);
  const prefix = options.prefix ?? 'lock-preview';
  const screen = frame(theme, 'lock', w, h);
  const { x, y, sw, sh, radius, foreground } = screen;
  const wallpaper = renderWallpaper(
    theme,
    'lock',
    { w: sw, h: sh, prefix: `${prefix}-wallpaper` },
    glyphs,
  );
  const clockResult = vector(
    w,
    h,
    clock(theme.type.display, '10:24', x + sw * 0.09, y + sh * 0.17, sw * 0.82, foreground),
  );
  const layers: RenderLayer[] = [
    { result: screen.base, x: 0, y: 0, w, h },
    { result: wallpaper, x, y, w: sw, h: sh, shape: 'rounded', radius },
    { result: clockResult, x: 0, y: 0, w, h },
    {
      result: renderWidget('ring', theme, { w: 400, h: 400, prefix: `${prefix}-ring` }, glyphs),
      x: x + sw * 0.1,
      y: y + sh * 0.36,
      w: sw * 0.35,
      h: sw * 0.35,
    },
    {
      result: renderWidget(
        'glyphBadge',
        theme,
        { w: 400, h: 400, prefix: `${prefix}-badge` },
        glyphs,
      ),
      x: x + sw * 0.55,
      y: y + sh * 0.36,
      w: sw * 0.35,
      h: sw * 0.35,
    },
    ...statusScrim(theme.palette.bg, screen, prefix),
    { result: chrome(glyphs, w, h, screen), x: 0, y: 0, w, h },
  ];
  return composeLayers(w, h, layers, prefix);
}
