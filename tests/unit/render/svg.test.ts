import { describe, expect, it } from 'vitest';
import { fmt, idFactory, svgDataUrl, svgDocument, svgInner } from '../../../lib/render/svg';

describe('SVG helpers', () => {
  it('rounds stable numbers and avoids nonfinite or negative zero output', () => {
    expect(fmt(1.234)).toBe('1.23');
    expect(fmt(-0.001)).toBe('0');
    expect(fmt(Infinity)).toBe('0');
  });
  it('namespaces deterministic local IDs and strips unsafe prefix characters', () => {
    const id = idFactory('preview "<');
    expect([id('blur'), id('clip')]).toEqual(['preview----blur-0', 'preview----clip-1']);
    expect(idFactory('preview')('blur')).toBe(idFactory('preview')('blur'));
  });
  it('wraps and unwraps self-contained artwork and encodes SVG data URLs', () => {
    const body = '<rect width="1" height="1"/>';
    const svg = svgDocument({ w: 1, h: 1, body });
    expect(svgInner(svg)).toBe(body);
    expect(svgDataUrl(svg)).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  });
});
