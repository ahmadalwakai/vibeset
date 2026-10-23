import type { RenderLayer, RenderResult } from './types';
import { fmt, idFactory, svgDocument, svgInner } from './svg';
import { roundedRectPath, superellipsePath } from './geometry';

export function namespaceSvgIds(svg: string, prefix: string): string {
  const nextId = idFactory(prefix);
  const replacements = new Map<string, string>();
  for (const match of svg.matchAll(/\bid="([A-Za-z0-9_-][\w.-]*)"/g)) {
    const original = match[1];
    if (original && !replacements.has(original)) replacements.set(original, nextId());
  }
  return svg
    .replace(/\bid="([A-Za-z0-9_-][\w.-]*)"/g, (attribute, original: string) => {
      const replacement = replacements.get(original);
      return replacement ? `id="${replacement}"` : attribute;
    })
    .replace(/url\(#([A-Za-z0-9_-][\w.-]*)\)/g, (reference, original: string) => {
      const replacement = replacements.get(original);
      return replacement ? `url(#${replacement})` : reference;
    });
}

export function vectorLayer(layer: RenderLayer, prefix: string): string {
  const svg = namespaceSvgIds(layer.result.svg, prefix);
  const nested = `<svg x="${fmt(layer.x)}" y="${fmt(layer.y)}" width="${fmt(layer.w)}" height="${fmt(layer.h)}" viewBox="0 0 ${fmt(layer.result.width)} ${fmt(layer.result.height)}" preserveAspectRatio="none">${svgInner(svg)}</svg>`;
  if (!layer.shape || layer.shape === 'square') return nested;
  const clip = idFactory(`${prefix}-layer`)('clip');
  const shape =
    layer.shape === 'circle'
      ? `<ellipse cx="${fmt(layer.x + layer.w / 2)}" cy="${fmt(layer.y + layer.h / 2)}" rx="${fmt(layer.w / 2)}" ry="${fmt(layer.h / 2)}"/>`
      : `<path d="${layer.shape === 'squircle' ? superellipsePath(layer.x, layer.y, layer.w, layer.h) : roundedRectPath(layer.x, layer.y, layer.w, layer.h, layer.radius ?? Math.min(layer.w, layer.h) * 0.22)}"/>`;
  return `<defs><clipPath id="${clip}">${shape}</clipPath></defs><g clip-path="url(#${clip})">${nested}</g>`;
}

export function composeLayers(
  w: number,
  h: number,
  layers: RenderLayer[],
  prefix: string,
): RenderResult {
  // Leave room for each layer index before idFactory applies its own prefix limit.
  const basePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 56) || 'composition';
  return {
    svg: svgDocument({
      w,
      h,
      body: layers.map((layer, index) => vectorLayer(layer, `${basePrefix}-${index}`)).join(''),
    }),
    width: w,
    height: h,
    grain: 0,
    noiseSeed: 0,
    warnings: [...new Set(layers.flatMap((layer) => layer.result.warnings))],
    layers,
  };
}
