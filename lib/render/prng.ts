import type { Rng, WeightedItem } from './types';

export function createRng(seed: number): Rng {
  let state = (Number.isFinite(seed) ? seed : 0) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  const range = (a: number, b: number): number => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new RangeError('Range must be finite');
    return a + (b - a) * next();
  };
  const int = (a: number, b: number): number => {
    const low = Math.ceil(Math.min(a, b));
    const high = Math.floor(Math.max(a, b));
    if (!Number.isFinite(low) || !Number.isFinite(high) || low > high)
      throw new RangeError('Integer range must contain a finite integer');
    return low + Math.floor(next() * (high - low + 1));
  };
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new RangeError('Cannot pick from an empty collection');
    // The checked nonempty collection and bounded index guarantee this item exists.
    return items[int(0, items.length - 1)] as T;
  };
  const weighted = <T>(items: readonly WeightedItem<T>[]): T => {
    if (items.some(({ weight }) => !Number.isFinite(weight) || weight < 0))
      throw new RangeError('Weights must be finite and nonnegative');
    const total = items.reduce((sum, { weight }) => sum + weight, 0);
    if (total <= 0 || !Number.isFinite(total)) throw new RangeError('Positive weight is required');
    let remaining = next() * total;
    let last: WeightedItem<T> | undefined;
    for (const item of items) {
      if (item.weight > 0) last = item;
      remaining -= item.weight;
      if (remaining < 0) return item.value;
    }
    if (!last) throw new RangeError('Positive weight is required');
    return last.value;
  };
  return {
    next,
    range,
    int,
    pick,
    weighted,
    chance: (probability: number): boolean => next() < Math.max(0, Math.min(1, probability)),
    shuffle: <T>(items: readonly T[]): T[] => {
      const output = [...items];
      for (let i = output.length - 1; i > 0; i -= 1) {
        const j = int(0, i);
        const item = output[i] as T;
        output[i] = output[j] as T;
        output[j] = item;
      }
      return output;
    },
  };
}
