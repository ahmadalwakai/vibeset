import { describe, expect, it } from 'vitest';
import {
  catmullRomPath,
  poissonDisk,
  roundedRectPath,
  superellipsePath,
} from '../../../lib/render/geometry';
import { createRng } from '../../../lib/render/prng';

describe('renderer geometry', () => {
  it('samples deterministic, bounded points respecting the minimum distance', () => {
    const sample = (): ReturnType<typeof poissonDisk> =>
      poissonDisk({ w: 300, h: 500, minDistance: 21, maxPoints: 200, rng: createRng(42) });
    const points = sample();
    expect(points).toEqual(sample());
    expect(points.length).toBeGreaterThan(100);
    expect(points.length).toBeLessThanOrEqual(200);
    for (const [i, point] of points.entries()) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThan(300);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThan(500);
      for (const other of points.slice(i + 1))
        expect(Math.hypot(point.x - other.x, point.y - other.y)).toBeGreaterThanOrEqual(21);
    }
    expect(poissonDisk({ w: 0, h: 5, minDistance: 1, maxPoints: 10, rng: createRng(0) })).toEqual(
      [],
    );
  });
  it('bounds attempts in a saturated sample', () => {
    expect(
      poissonDisk({
        w: 10,
        h: 10,
        minDistance: 20,
        maxPoints: 10_000,
        rng: createRng(1),
        attempts: 0,
      }),
    ).toHaveLength(1);
  });
  it('spreads sparse points across the complete canvas', () => {
    const points = poissonDisk({
      w: 300,
      h: 600,
      minDistance: 10,
      maxPoints: 60,
      rng: createRng(42),
    });
    expect(
      Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y)),
    ).toBeGreaterThan(500);
    expect(
      Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x)),
    ).toBeGreaterThan(250);
    expect(new Set(points.map((point) => Math.floor(point.y / 200)))).toEqual(new Set([0, 1, 2]));
  });
  it('interpolates through endpoints and closes requested curves', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
    ];
    expect(catmullRomPath(points)).toMatch(/^M0 0C.*100 0$/);
    expect(catmullRomPath(points, true)).toMatch(/0 0Z$/);
    expect(catmullRomPath([])).toBe('');
  });
  it('builds a 64-point superellipse and clamps rounded rectangle radii', () => {
    const path = superellipsePath(10, 20, 100, 80);
    expect(path.match(/L/g) ?? []).toHaveLength(63);
    expect(path).toMatch(/^M110 60/);
    expect(path).toContain('L10 60');
    expect(roundedRectPath(10, 20, 100, 80, 500)).toMatch(/^M50 20H70Q110 20 110 60/);
    expect(path).not.toMatch(/NaN|Infinity/);
  });
});
