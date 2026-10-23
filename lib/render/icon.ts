import { z } from 'zod';
import { iconStyleSchema, paletteSchema, type IconStyle } from './spec';
import type { IconRenderOptions, RenderResult } from './types';
import { mixOklab } from './color';
import { roundedRectPath, superellipsePath } from './geometry';
import { placeGlyph, resolveGlyph } from './glyphs';
import { fmt, idFactory, svgDocument, svgInner } from './svg';
import { composeLayers, namespaceSvgIds } from './composition';

const optionsSchema = z.object({
  size: z.number().int().min(8).max(4096),
  platform: z.enum(['ios', 'shaped']),
});

function shapePath(shape: IconStyle['shape'], size: number, inset = 0): string {
  const side = Math.max(0, size - inset * 2);
  if (shape === 'squircle') return superellipsePath(inset, inset, side, side);
  if (shape === 'rounded') return roundedRectPath(inset, inset, side, side, side * 0.22);
  if (shape === 'circle') {
    const center = size / 2;
    const radius = side / 2;
    return `M${fmt(center - radius)} ${fmt(center)}a${fmt(radius)} ${fmt(radius)} 0 1 0 ${fmt(side)} 0a${fmt(radius)} ${fmt(radius)} 0 1 0 -${fmt(side)} 0Z`;
  }
  return roundedRectPath(inset, inset, side, side, 0);
}

export function renderIcon(
  style: IconStyle,
  glyphMarkup: string | undefined,
  options: IconRenderOptions,
): RenderResult {
  const icon = iconStyleSchema.parse(style);
  const palette = paletteSchema.parse(options.palette);
  const { size, platform } = optionsSchema.parse(options);
  const ids = idFactory(options.prefix ?? 'icon');
  const clip = ids('clip');
  const shape = platform === 'ios' ? 'square' : icon.shape;
  const warnings: string[] = [];
  let defs = '';
  let background = `<rect width="${size}" height="${size}" fill="${icon.bg}"/>`;
  let photo: RenderResult['background'];
  let grain = 0;
  let noiseSeed = 0;

  if (icon.fill === 'gradient') {
    const gradient = ids('gradient');
    defs += `<linearGradient id="${gradient}" x2="1" y2="1"><stop stop-color="${icon.bg}"/><stop offset="1" stop-color="${icon.bg2 ?? icon.bg}"/></linearGradient>`;
    background = `<rect width="${size}" height="${size}" fill="url(#${gradient})"/>`;
  } else if (icon.fill === 'glass') {
    const highlight = ids('highlight');
    defs += `<linearGradient id="${highlight}" x2="0" y2="1"><stop stop-color="#ffffff" stop-opacity="0.18"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`;
    background = `<rect width="${size}" height="${size}" fill="${mixOklab(palette.primary, palette.surface, 0.6)}"/><rect width="${size}" height="${size}" fill="url(#${highlight})"/><path d="${shapePath(shape, size, size * 0.012)}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="${fmt(size * 0.008)}"/>`;
  } else if (icon.fill === 'outline') {
    background = `<rect width="${size}" height="${size}" fill="${palette.bg}"/><path d="${shapePath(shape, size, size * 0.08)}" fill="none" stroke="${icon.border?.color ?? palette.primary}" stroke-width="${fmt(size * 0.055)}"/>`;
  } else if (icon.fill === 'pattern') {
    const pattern = ids('pattern');
    const tile = size * 0.1;
    defs += `<pattern id="${pattern}" width="${fmt(tile)}" height="${fmt(tile)}" patternUnits="userSpaceOnUse"><circle cx="${fmt(tile / 2)}" cy="${fmt(tile / 2)}" r="${fmt(tile * 0.13)}" fill="${palette.accent}" fill-opacity="0.18"/></pattern>`;
    background = `<rect width="${size}" height="${size}" fill="${palette.surface}"/><rect width="${size}" height="${size}" fill="url(#${pattern})"/>`;
  } else if (icon.fill === 'wallpaper') {
    const wallpaper = options.wallpaper;
    if (!wallpaper) throw new Error('Wallpaper icon fill requires a rendered wallpaper');
    background = `<svg width="${size}" height="${size}" viewBox="0 0 ${fmt(wallpaper.width)} ${fmt(wallpaper.height)}" preserveAspectRatio="xMidYMid slice">${svgInner(namespaceSvgIds(wallpaper.svg, ids('wallpaper')))}</svg><rect width="${size}" height="${size}" fill="#000000" fill-opacity="0.25"/>`;
    warnings.push(...wallpaper.warnings);
    grain = wallpaper.grain;
    noiseSeed = wallpaper.noiseSeed;
    if (wallpaper.background) {
      photo = {
        ...wallpaper.background,
        placement: { x: 0, y: 0, w: size, h: size, shape, radius: size * 0.22 },
      };
    }
  }

  const glyphSize = size * icon.glyphScale;
  const glyph = glyphMarkup ?? '<circle cx="128" cy="128" r="72"/>';
  if (!glyphMarkup) warnings.push('Missing icon glyph');
  let glyphBody = placeGlyph({
    markup: glyph,
    x: (size - glyphSize) / 2,
    y: (size - glyphSize) / 2,
    size: glyphSize,
    color: icon.glyphColor,
  });
  if (icon.shadow || icon.fill === 'wallpaper') {
    const shadow = ids('shadow');
    defs += `<filter id="${shadow}" filterUnits="userSpaceOnUse" x="0" y="0" width="${size}" height="${size}"><feDropShadow dx="0" dy="${fmt(size * 0.015)}" stdDeviation="${fmt(size * 0.022)}" flood-color="#000000" flood-opacity="0.3"/></filter>`;
    glyphBody = `<g filter="url(#${shadow})">${glyphBody}</g>`;
  }
  let details = '';
  if (icon.border && icon.border.width > 0) {
    const width = icon.border.width * size;
    details += `<path d="${shapePath(shape, size, width / 2)}" fill="none" stroke="${icon.border.color}" stroke-width="${fmt(width)}"/>`;
  }
  if (icon.sticker) {
    const stickerSize = size * 0.22;
    const x = icon.sticker.corner.endsWith('l') ? size * 0.06 : size * 0.72;
    const y = icon.sticker.corner.startsWith('t') ? size * 0.06 : size * 0.72;
    details += `<circle cx="${fmt(x + stickerSize / 2)}" cy="${fmt(y + stickerSize / 2)}" r="${fmt(stickerSize / 2)}" fill="${icon.sticker.color}"/>`;
    details += placeGlyph({
      markup: resolveGlyph(options.glyphs, icon.sticker.glyph, icon.glyphWeight, warnings),
      x: x + stickerSize * 0.17,
      y: y + stickerSize * 0.17,
      size: stickerSize * 0.66,
      color: palette.ink,
    });
  }

  const result: RenderResult = {
    svg: svgDocument({
      w: size,
      h: size,
      defs: `<clipPath id="${clip}"><path d="${shapePath(photo ? 'square' : shape, size)}"/></clipPath>${defs}`,
      body: `<g clip-path="url(#${clip})">${background}${glyphBody}${details}</g>`,
    }),
    width: size,
    height: size,
    ...(photo ? { background: photo } : {}),
    grain,
    noiseSeed,
    warnings: [...new Set(warnings)],
  };
  if (!photo) return result;

  const base: RenderResult = {
    svg: svgDocument({
      w: size,
      h: size,
      body: `<rect width="${size}" height="${size}" fill="${palette.bg}"/>`,
    }),
    width: size,
    height: size,
    grain: 0,
    noiseSeed: 0,
    warnings: [],
  };
  const leaf: RenderResult = {
    ...result,
    background: { ...photo, placement: { x: 0, y: 0, w: size, h: size, shape: 'square' } },
  };
  const opaque = composeLayers(
    size,
    size,
    [
      { result: base, x: 0, y: 0, w: size, h: size },
      { result: leaf, x: 0, y: 0, w: size, h: size },
    ],
    `${options.prefix ?? 'icon'}-opaque`,
  );
  return {
    ...composeLayers(
      size,
      size,
      [{ result: opaque, x: 0, y: 0, w: size, h: size, shape, radius: size * 0.22 }],
      `${options.prefix ?? 'icon'}-shape`,
    ),
    background: photo,
  };
}
