import { access } from 'node:fs/promises';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { GLYPH_WEIGHTS } from '../../../lib/render/spec';
import { getFontFiles } from '../../../server/render/fonts';
import { loadServerGlyphs } from '../../../server/render/glyphs';
import { dHash, hamming } from '../../../server/render/hash';

vi.mock('server-only', () => ({}));

describe('server render assets', () => {
  it('loads validated glyphs for all six weights and memoizes the source', async () => {
    const source = await loadServerGlyphs();
    expect(await loadServerGlyphs()).toBe(source);
    for (const weight of GLYPH_WEIGHTS) expect(source.get('heart', weight)).toContain('<path');
    expect(source.get('missing-glyph', 'regular')).toBeUndefined();
    expect(source.get('constructor', 'regular')).toBeUndefined();
  });
  it('resolves all six bundled font files without exposing the cached array', async () => {
    const files = await getFontFiles();
    expect(files).toHaveLength(6);
    await Promise.all(files.map((file) => access(file)));
    files.pop();
    expect(await getFontFiles()).toHaveLength(6);
  });
});

describe('difference hashes', () => {
  it('encodes 64 horizontal comparisons and compares strict hexadecimal hashes', async () => {
    const image = async (descending: boolean): Promise<Buffer> => {
      const pixels = Buffer.from(
        Array.from({ length: 72 }, (_, index) => (descending ? 8 - (index % 9) : index % 9) * 28),
      );
      return sharp(pixels, { raw: { width: 9, height: 8, channels: 1 } })
        .png()
        .toBuffer();
    };
    expect(await dHash(await image(false))).toBe('0000000000000000');
    expect(await dHash(await image(true))).toBe('ffffffffffffffff');
    expect(hamming('0000000000000000', 'FFFFFFFFFFFFFFFF')).toBe(64);
    expect(hamming('a400000000000000', 'a500000000000000')).toBe(1);
    expect(hamming('0123456789abcdef', '0123456789abcdef')).toBe(0);
    for (const invalid of [
      '',
      'a'.repeat(15),
      'g'.repeat(16),
      'a'.repeat(17),
      '0x00000000000000',
    ]) {
      expect(() => hamming(invalid, '0'.repeat(16))).toThrow();
    }
  });
});
