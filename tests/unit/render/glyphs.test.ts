import { describe, expect, it } from 'vitest';
import { parseGlyphRecord, placeGlyph, resolveGlyph } from '../../../lib/render/glyphs';

describe('glyph data boundary', () => {
  it('accepts sanitized geometry with inherited colour and freezes the record', () => {
    const markup =
      '<g transform="translate(1 2)" fill="currentColor"><path d="M0 0L20 20Z" opacity="0.2"/><circle cx="2" cy="2" r="1" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></g>';
    const record = parseGlyphRecord({ star: markup });
    expect(record.star).toBe(markup);
    expect(Object.isFrozen(record)).toBe(true);
  });
  it.each([
    '<script/>',
    '<text>hi</text>',
    '<foreignObject/>',
    '<path onclick="alert(1)"/>',
    '<path style="fill:red"/>',
    '<image href="https://example.com/x"/>',
    '<path fill="url(#unsafe)"/>',
    '<path fill="#ffffff"/>',
    '<path d="M0 0"/>&amp;',
    '<path d="M0 0"/>unparsed',
    '<g><path d="M0 0"/></path>',
    '<g>',
    '<path d=M0/>',
    '<path opacity="1" opacity="0"/>',
    '<path d="&quot;"/>',
    '<!DOCTYPE svg><path/>',
    '<path/><!-- comment -->',
    '<path transform="url(http://host)"/>',
  ])('rejects unsafe or malformed inner markup %s', (markup) => {
    expect(() => parseGlyphRecord({ star: markup })).toThrow();
  });
  it('rejects invalid names, oversized records and markup', () => {
    expect(() => parseGlyphRecord({ '../star': '<path/>' })).toThrow();
    expect(() => parseGlyphRecord({ star: ' '.repeat(65_537) })).toThrow();
    expect(() =>
      parseGlyphRecord(
        Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`glyph-${i}`, '<path/>'])),
      ),
    ).toThrow();
  });
  it('returns a visible missing-glyph fallback with one warning', () => {
    const warnings: string[] = [];
    const glyphs = { get: (): undefined => undefined };
    const markup = resolveGlyph(glyphs, 'missing', 'regular', warnings);
    resolveGlyph(glyphs, 'missing', 'regular', warnings);
    expect(markup).toContain('<circle');
    expect(warnings).toHaveLength(1);
    expect(placeGlyph({ markup, x: 10, y: 20, size: 128, color: '#abcdef', rotate: 90 })).toContain(
      'translate(10 20) rotate(90 64 64) scale(0.5)',
    );
  });
});
