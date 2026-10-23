import { z } from 'zod';
import { themeSpecSchema, type ThemeSpec } from './spec';
import type { GlyphSource, RenderDimensions, RenderResult, WidgetKind } from './types';
import { mixOklab } from './color';
import { placeGlyph, resolveGlyph } from './glyphs';
import { createRng } from './prng';
import { fmt, idFactory, svgDocument } from './svg';

const dimensions = z.object({
  w: z.number().min(1).max(8192),
  h: z.number().min(1).max(8192),
});
const widgetKindSchema = z.enum(['glyphBadge', 'ring', 'stickerCollage', 'photoFrame']);

export function renderWidget(
  kind: WidgetKind,
  spec: ThemeSpec,
  options: RenderDimensions,
  glyphs: GlyphSource,
): RenderResult {
  const theme = themeSpecSchema.parse(spec);
  widgetKindSchema.parse(kind);
  const { w, h } = dimensions.parse(options);
  const short = Math.min(w, h);
  const radius = theme.widgets.radius * short;
  const ids = idFactory(options.prefix ?? `widget-${kind}`);
  const warnings: string[] = [];
  const rng = createRng('seed' in theme.wallpaper ? theme.wallpaper.seed : 0);
  let defs = '';
  let fill = theme.widgets.surface;
  let base: string;
  const style = theme.widgets.style;
  if (style === 'glass') {
    fill = mixOklab(theme.palette.primary, theme.widgets.surface, 0.72);
    const shine = ids('shine');
    defs += `<linearGradient id="${shine}" x2="0" y2="1"><stop stop-color="#ffffff" stop-opacity="0.25"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.02"/></linearGradient>`;
    base = `<rect width="${fmt(w)}" height="${fmt(h)}" rx="${fmt(radius)}" fill="${fill}"/><rect width="${fmt(w)}" height="${fmt(h)}" rx="${fmt(radius)}" fill="url(#${shine})"/>`;
  } else {
    base = `<rect x="${fmt(short * 0.012)}" y="${fmt(short * 0.012)}" width="${fmt(w - short * 0.024)}" height="${fmt(h - short * 0.024)}" rx="${fmt(radius)}" fill="${style === 'outline' ? theme.palette.bg : fill}" stroke="${style === 'outline' ? theme.widgets.ink : theme.widgets.surface}" stroke-width="${fmt(short * 0.024)}"/>`;
  }
  if (style === 'paper') {
    for (let line = 1; line <= 5; line += 1) {
      const y = h * (0.17 + line * 0.12);
      base += `<path d="M${fmt(w * 0.08)} ${fmt(y)}H${fmt(w * 0.92)}" stroke="${theme.widgets.ink}" stroke-opacity="0.08" stroke-width="${fmt(short * 0.004)}"/>`;
    }
  }
  const name = theme.decor[0] ?? 'sparkle';
  const glyph = (
    glyphName: string,
    x: number,
    y: number,
    size: number,
    color = theme.widgets.ink,
    rotate = 0,
  ): string =>
    placeGlyph({
      markup: resolveGlyph(glyphs, glyphName, theme.icons.glyphWeight, warnings),
      x,
      y,
      size,
      color,
      rotate,
    });
  let body = base;
  if (kind === 'glyphBadge') {
    body += `<circle cx="${fmt(w / 2)}" cy="${fmt(h / 2)}" r="${fmt(short * 0.33)}" fill="${theme.widgets.accent}" fill-opacity="0.16"/>`;
    body += glyph(name, w / 2 - short * 0.23, h / 2 - short * 0.23, short * 0.46);
  } else if (kind === 'ring') {
    const r = short * 0.34;
    const circumference = 2 * Math.PI * r;
    body += `<circle cx="${fmt(w / 2)}" cy="${fmt(h / 2)}" r="${fmt(r)}" fill="none" stroke="${theme.widgets.accent}" stroke-opacity="0.16" stroke-width="${fmt(short * 0.065)}"/><circle cx="${fmt(w / 2)}" cy="${fmt(h / 2)}" r="${fmt(r)}" fill="none" stroke="${theme.widgets.accent}" stroke-width="${fmt(short * 0.065)}" stroke-linecap="round" stroke-dasharray="${fmt(circumference * 0.72)} ${fmt(circumference)}" transform="rotate(-90 ${fmt(w / 2)} ${fmt(h / 2)})"/>`;
    body += glyph(name, w / 2 - short * 0.17, h / 2 - short * 0.17, short * 0.34);
  } else if (kind === 'stickerCollage') {
    const positions = [
      [0.16, 0.28, -18],
      [0.42, 0.12, 12],
      [0.67, 0.43, -10],
      [0.36, 0.57, 20],
      [0.76, 0.05, 16],
    ] as const;
    const count = rng.int(3, 5);
    positions.slice(0, count).forEach(([x, y, rotate], index) => {
      const size = short * rng.range(0.32, 0.42);
      const glyphName = theme.decor[index % Math.max(1, theme.decor.length)] ?? 'sparkle';
      body += glyph(
        glyphName,
        x * w - size * 0.1,
        y * h,
        size,
        index % 2 ? theme.widgets.accent : theme.widgets.ink,
        rotate,
      );
    });
  } else {
    const inset = short * 0.09;
    body += `<rect x="${fmt(inset)}" y="${fmt(inset)}" width="${fmt(w - inset * 2)}" height="${fmt(h - inset * 2)}" rx="${fmt(Math.max(0, radius - inset / 2))}" fill="${theme.palette.bg}"/><rect x="${fmt(inset * 1.4)}" y="${fmt(inset * 1.4)}" width="${fmt(w - inset * 2.8)}" height="${fmt(h - inset * 2.8)}" rx="${fmt(radius * 0.6)}" fill="none" stroke="${theme.widgets.accent}" stroke-opacity="0.25" stroke-width="${fmt(short * 0.008)}"/>`;
    body += glyph(name, inset * 0.25, inset * 0.25, short * 0.23, theme.widgets.accent, -15);
    body += glyph(
      theme.decor[1] ?? name,
      w - short * 0.26,
      h - short * 0.27,
      short * 0.23,
      theme.widgets.accent,
      15,
    );
  }
  return {
    svg: svgDocument({ w, h, defs, body }),
    width: w,
    height: h,
    grain: 0,
    noiseSeed: 0,
    warnings,
  };
}
