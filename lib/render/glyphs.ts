import { fmt } from './svg';
import { z } from 'zod';
import type { GlyphSource, GlyphWeight } from './types';
export type { GlyphSource } from './types';

const elements = new Set(['g', 'path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon']);
const numericAttributes = new Set([
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'width',
  'height',
  'x1',
  'y1',
  'x2',
  'y2',
  'stroke-width',
]);
const numberPattern = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

function validAttribute(name: string, value: string): boolean {
  if (/[&<>]/.test(value)) return false;
  if (numericAttributes.has(name))
    return numberPattern.test(value) && Number.isFinite(Number(value));
  if (name === 'opacity')
    return numberPattern.test(value) && Number(value) >= 0 && Number(value) <= 1;
  if (name === 'd') return /^[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]+$/.test(value);
  if (name === 'points') return /^[-+0-9.eE,\s]+$/.test(value);
  if (name === 'transform')
    return /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\(\s*[-+0-9.eE,\s]+\)\s*)+$/.test(
      value,
    );
  if (name === 'fill-rule' || name === 'clip-rule')
    return value === 'nonzero' || value === 'evenodd';
  if (name === 'stroke-linecap') return ['butt', 'round', 'square'].includes(value);
  if (name === 'stroke-linejoin') return ['miter', 'round', 'bevel'].includes(value);
  return ['fill', 'stroke', 'color'].includes(name) && ['currentColor', 'none'].includes(value);
}

function validMarkup(markup: string): boolean {
  const token = /<(\/?)([a-z]+)([^<>]*?)(\/?)>/gy;
  const attribute = /\s+([a-z][a-z-]*)\s*=\s*(["'])([\s\S]*?)\2/gy;
  const stack: string[] = [];
  let cursor = 0;
  let count = 0;
  while (cursor < markup.length) {
    while (/\s/.test(markup.charAt(cursor)) && cursor < markup.length) cursor += 1;
    if (cursor === markup.length) break;
    token.lastIndex = cursor;
    const match = token.exec(markup);
    if (!match) return false;
    const [, closing, name = '', attributes = '', selfClosing] = match;
    if (!elements.has(name) || ++count > 10_000) return false;
    if (closing) {
      if (attributes.trim() || selfClosing || stack.pop() !== name) return false;
    } else {
      let position = 0;
      const seen = new Set<string>();
      while (position < attributes.length && attributes.slice(position).trim()) {
        attribute.lastIndex = position;
        const parsed = attribute.exec(attributes);
        if (!parsed) return false;
        const [, key = '', , value = ''] = parsed;
        if (seen.has(key) || !validAttribute(key, value)) return false;
        seen.add(key);
        position = attribute.lastIndex;
      }
      if (!selfClosing) stack.push(name);
      if (stack.length > 32) return false;
    }
    cursor = token.lastIndex;
  }
  return count > 0 && stack.length === 0;
}

const glyphRecordSchema = z
  .record(
    z.string().regex(/^[a-z0-9-]{1,48}$/),
    z.string().min(1).max(65_536).refine(validMarkup, 'Invalid glyph markup'),
  )
  .refine((record) => Object.keys(record).length <= 2_000, 'Too many glyphs');

export function parseGlyphRecord(value: unknown): Readonly<Record<string, string>> {
  return Object.freeze(glyphRecordSchema.parse(value));
}

export function resolveGlyph(
  source: GlyphSource,
  name: string,
  weight: GlyphWeight,
  warnings: string[],
): string {
  const markup = /^[a-z0-9-]{1,48}$/.test(name) ? source.get(name, weight) : undefined;
  if (markup) return markup;
  const warning = `Missing glyph: ${name} (${weight})`;
  if (!warnings.includes(warning)) warnings.push(warning);
  return '<circle cx="128" cy="128" r="64" opacity="0.35"/>';
}

export function placeGlyph({
  markup,
  x,
  y,
  size,
  color,
  rotate = 0,
}: {
  markup: string;
  x: number;
  y: number;
  size: number;
  color: string;
  rotate?: number;
}): string {
  const safeColor = /^#[0-9a-f]{6}$/.test(color) ? color : '#808080';
  const side = Math.max(0, size);
  return `<g color="${safeColor}" fill="currentColor" transform="translate(${fmt(x)} ${fmt(y)}) rotate(${fmt(rotate)} ${fmt(side / 2)} ${fmt(side / 2)}) scale(${fmt(side / 256)})">${markup}</g>`;
}
