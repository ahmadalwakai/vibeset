const elements = new Set(['g', 'path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon']);
const attributes = new Set([
  'd',
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
  'points',
  'opacity',
  'fill-rule',
  'clip-rule',
  'transform',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'fill',
  'stroke',
]);
const number = /^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?$/i;
const numberList = /^[-+\d.eE,\s]+$/;
const tagPattern =
  /<\/?[a-zA-Z][\w:-]*(?:\s+[a-zA-Z_:][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*\s*\/?>/g;
const attributePattern = /\s+([a-zA-Z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/g;

export function isGenericGlyph(icon: { name: string; categories: readonly string[] }): boolean {
  return !icon.categories.includes('brands') && !icon.name.includes('-logo');
}

function sanitizeAttribute(name: string, rawValue: string): string {
  const value = rawValue.trim().replace(/\s+/g, ' ');
  if (name === 'fill' || name === 'stroke') {
    if (value === 'none' || value === 'currentColor') return value;
    if (/^(?:#[\da-f]{3,8}|[a-z]+)$/i.test(value)) return 'currentColor';
    throw new Error(`Unsupported SVG paint: ${name}`);
  }
  if (name === 'd' && /^[MmLlHhVvCcSsQqTtAaZzEe\d,.\s+-]+$/.test(value)) return value;
  if (name === 'points' && numberList.test(value)) return value;
  if (
    name === 'transform' &&
    /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([-+\d.eE,\s]+\)\s*)+$/.test(value)
  )
    return value;
  if ((name === 'fill-rule' || name === 'clip-rule') && /^(nonzero|evenodd)$/.test(value))
    return value;
  if (name === 'stroke-linecap' && /^(butt|round|square)$/.test(value)) return value;
  if (name === 'stroke-linejoin' && /^(miter|round|bevel)$/.test(value)) return value;
  if (name === 'opacity' && (!number.test(value) || Number(value) < 0 || Number(value) > 1)) {
    throw new Error('Invalid SVG opacity');
  }
  if (
    ![
      'd',
      'points',
      'transform',
      'fill-rule',
      'clip-rule',
      'stroke-linecap',
      'stroke-linejoin',
    ].includes(name) &&
    number.test(value) &&
    Number.isFinite(Number(value))
  )
    return value;
  throw new Error(`Invalid SVG attribute: ${name}`);
}

/** Parse a deliberately small XML subset, then rebuild only approved elements and attributes. */
export function sanitizeGlyphSvg(source: string): string {
  if (source.length > 250_000 || /<!|<\?|&/.test(source)) throw new Error('Unsupported SVG XML');
  const stack: string[] = [];
  const output: string[] = [];
  let cursor = 0;
  let sawRoot = false;
  let closedRoot = false;
  let rootPaint = '';
  for (const token of source.matchAll(tagPattern)) {
    if (source.slice(cursor, token.index).trim()) throw new Error('Unexpected SVG content');
    cursor = token.index + token[0].length;
    const name = /^<\/?([\w:-]+)/.exec(token[0])?.[1];
    if (!name) throw new Error('Invalid SVG element');
    const closing = token[0].startsWith('</');
    const selfClosing = token[0].endsWith('/>');
    if (closing) {
      if (!/^<\/[a-zA-Z][\w:-]*\s*>$/.test(token[0])) throw new Error('Invalid SVG closing tag');
      if (stack.pop() !== name) throw new Error('Unbalanced SVG elements');
      if (name === 'svg') {
        closedRoot = true;
        if (rootPaint) output.push('</g>');
      } else output.push(`</${name}>`);
      continue;
    }
    if (closedRoot || (name !== 'svg' && !sawRoot)) throw new Error('SVG must have one root');
    const parsed = [...token[0].matchAll(attributePattern)];
    if (new Set(parsed.map((attribute) => attribute[1])).size !== parsed.length) {
      throw new Error('Duplicate SVG attribute');
    }
    if (name === 'svg') {
      if (sawRoot || selfClosing) throw new Error('SVG must have one nonempty root');
      sawRoot = true;
      const viewBox = parsed.find((attribute) => attribute[1] === 'viewBox')?.[3];
      if (viewBox?.trim().replace(/[ ,]+/g, ' ') !== '0 0 256 256')
        throw new Error('Unexpected glyph viewBox');
      const paints = parsed.filter(
        (attribute) => attribute[1] === 'fill' || attribute[1] === 'stroke',
      );
      rootPaint = paints
        .flatMap((attribute) => {
          const key = attribute[1] ?? '';
          const paint = sanitizeAttribute(key, attribute[3] ?? '');
          return key === 'fill' && paint === 'currentColor' ? [] : [` ${key}="${paint}"`];
        })
        .join('');
      if (rootPaint) output.push(`<g${rootPaint}>`);
    } else {
      if (!elements.has(name)) throw new Error(`Unsupported SVG element: ${name}`);
      const safe = parsed
        .flatMap((attribute) => {
          const key = attribute[1] ?? '';
          if (!attributes.has(key)) throw new Error(`Unsupported SVG attribute: ${key}`);
          return [` ${key}="${sanitizeAttribute(key, attribute[3] ?? '')}"`];
        })
        .join('');
      output.push(`<${name}${safe}${selfClosing ? '/>' : '>'}`);
    }
    if (!selfClosing) stack.push(name);
  }
  if (!sawRoot || !closedRoot || stack.length || source.slice(cursor).trim() || !output.length) {
    throw new Error('Incomplete SVG document');
  }
  return output.join('');
}
