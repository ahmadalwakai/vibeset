import { describe, expect, it } from 'vitest';
import { createRng } from '../../../lib/render/prng';

describe('seeded PRNG', () => {
  it('keeps the mulberry32 sequence stable', () => {
    const rng = createRng(42);
    expect(Array.from({ length: 5 }, () => rng.next())).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693,
      0.17481389874592423,
    ]);
  });
  it('includes both integer bounds and never returns a value outside them', () => {
    const rng = createRng(7);
    const values = Array.from({ length: 100 }, () => rng.int(2, 3));
    expect(new Set(values)).toEqual(new Set([2, 3]));
    expect(() => rng.int(1.2, 1.4)).toThrow(RangeError);
    expect(() => rng.int(0, Infinity)).toThrow(RangeError);
    expect(() => rng.range(0, NaN)).toThrow(RangeError);
  });
  it('does not mutate shuffled inputs and repeats mixed operations for a seed', () => {
    const input = Object.freeze(['a', 'b', 'c', 'd']);
    const run = (): unknown[] => {
      const rng = createRng(19);
      return [rng.range(-2, 4), rng.pick(input), rng.shuffle(input), rng.chance(0.4)];
    };
    expect(run()).toEqual(run());
    expect(input).toEqual(['a', 'b', 'c', 'd']);
  });
  it('ignores zero weights and rejects empty or invalid distributions', () => {
    const rng = createRng(1);
    expect(
      rng.weighted([
        { value: 'never', weight: 0 },
        { value: 'yes', weight: 2 },
      ]),
    ).toBe('yes');
    expect(() => rng.pick([])).toThrow(RangeError);
    for (const weight of [-1, Infinity, NaN, 0])
      expect(() => rng.weighted([{ value: 1, weight }])).toThrow(RangeError);
    expect(rng.chance(-1)).toBe(false);
    expect(rng.chance(2)).toBe(true);
  });
});
