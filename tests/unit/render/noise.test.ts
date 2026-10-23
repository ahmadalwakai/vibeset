import { describe, expect, it } from 'vitest';
import { noiseTile } from '../../../lib/render/noise';

describe('seeded grain', () => {
  it('produces byte-identical RGBA noise for equal seeds with bounded alpha', () => {
    const tile = noiseTile(42, 0.1, 8);
    expect(tile).toEqual(noiseTile(42, 0.1, 8));
    expect(tile).not.toEqual(noiseTile(43, 0.1, 8));
    expect(tile).toHaveLength(8 * 8 * 4);
    for (let i = 0; i < tile.length; i += 4) {
      expect(tile[i]).toBe(tile[i + 1]);
      expect(tile[i]).toBe(tile[i + 2]);
      expect(tile[i + 3]).toBeLessThanOrEqual(26);
    }
  });
  it('has zero alpha when disabled and clamps hostile tile sizes', () => {
    const pixels = noiseTile(42, 0, 2);
    expect([pixels[3], pixels[7], pixels[11], pixels[15]]).toEqual([0, 0, 0, 0]);
    expect(noiseTile(42, 1, -1)).toHaveLength(4);
  });
});
