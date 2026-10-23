export function fmt(value: number): string {
  const rounded = Number((Number.isFinite(value) ? value : 0).toFixed(2));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function svgDocument({
  w,
  h,
  defs = '',
  body,
}: {
  w: number;
  h: number;
  defs?: string;
  body: string;
}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w)}" height="${fmt(h)}" viewBox="0 0 ${fmt(w)} ${fmt(h)}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}

export function idFactory(prefix: string): (label?: string) => string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'render';
  let count = 0;
  return (label = 'id'): string =>
    `${safePrefix}-${label.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48)}-${count++}`;
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function svgInner(svg: string): string {
  return svg.replace(/^\s*<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}
