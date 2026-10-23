import { fmt } from './svg';
import type { Point, Rng } from './types';

export function catmullRomPath(points: readonly Point[], closed = false): string {
  const first = points[0];
  if (!first) return '';
  if (points.length === 1) return `M${fmt(first.x)} ${fmt(first.y)}${closed ? 'Z' : ''}`;
  const at = (index: number): Point =>
    points[
      closed
        ? (index + points.length) % points.length
        : Math.max(0, Math.min(points.length - 1, index))
    ] as Point;
  let path = `M${fmt(first.x)} ${fmt(first.y)}`;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i += 1) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    if (!p0 || !p1 || !p2 || !p3) continue;
    path += `C${fmt(p1.x + (p2.x - p0.x) / 6)} ${fmt(p1.y + (p2.y - p0.y) / 6)} ${fmt(p2.x - (p3.x - p1.x) / 6)} ${fmt(p2.y - (p3.y - p1.y) / 6)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return path + (closed ? 'Z' : '');
}

export function poissonDisk({
  w,
  h,
  minDistance,
  maxPoints,
  rng,
  attempts = 30,
}: {
  w: number;
  h: number;
  minDistance: number;
  maxPoints: number;
  rng: Rng;
  attempts?: number;
}): Point[] {
  if (
    ![w, h, minDistance, maxPoints].every(Number.isFinite) ||
    w <= 0 ||
    h <= 0 ||
    minDistance <= 0 ||
    maxPoints <= 0
  )
    return [];
  const limit = Math.min(10_000, Math.floor(maxPoints));
  if (limit === 0) return [];
  const tries = Math.max(1, Math.min(100, Math.round(attempts) || 30));
  const cell = minDistance / Math.SQRT2;
  const grid = new Map<string, Point>();
  const output: Point[] = [];
  // Bounded global dart throwing spreads sparse samples over the whole canvas,
  // instead of stopping a growing frontier before it reaches the outer regions.
  for (let attempt = 0; attempt < limit * tries && output.length < limit; attempt += 1) {
    const point = { x: rng.range(0, w), y: rng.range(0, h) };
    const gx = Math.floor(point.x / cell);
    const gy = Math.floor(point.y / cell);
    let nearby = false;
    for (let x = gx - 2; x <= gx + 2 && !nearby; x += 1) {
      for (let y = gy - 2; y <= gy + 2; y += 1) {
        const other = grid.get(`${x},${y}`);
        if (other && Math.hypot(other.x - point.x, other.y - point.y) < minDistance) {
          nearby = true;
          break;
        }
      }
    }
    if (!nearby) {
      output.push(point);
      grid.set(`${gx},${gy}`, point);
    }
  }
  return output;
}

export function superellipsePath(
  x: number,
  y: number,
  w: number,
  h: number,
  n = 5,
  points = 64,
): string {
  const width = Math.max(0, w);
  const height = Math.max(0, h);
  const exponent = 2 / Math.max(0.5, Math.min(32, Number.isFinite(n) ? n : 5));
  const count = Math.max(12, Math.min(512, Math.round(points) || 64));
  const coordinates: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i * Math.PI * 2) / count;
    const a = Math.cos(angle);
    const b = Math.sin(angle);
    const px = x + width / 2 + (width / 2) * Math.sign(a) * Math.abs(a) ** exponent;
    const py = y + height / 2 + (height / 2) * Math.sign(b) * Math.abs(b) ** exponent;
    coordinates.push(`${i === 0 ? 'M' : 'L'}${fmt(px)} ${fmt(py)}`);
  }
  return coordinates.join('') + 'Z';
}

export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const width = Math.max(0, w);
  const height = Math.max(0, h);
  const radius = Math.max(0, Math.min(width / 2, height / 2, r));
  const right = x + width;
  const bottom = y + height;
  return `M${fmt(x + radius)} ${fmt(y)}H${fmt(right - radius)}Q${fmt(right)} ${fmt(y)} ${fmt(right)} ${fmt(y + radius)}V${fmt(bottom - radius)}Q${fmt(right)} ${fmt(bottom)} ${fmt(right - radius)} ${fmt(bottom)}H${fmt(x + radius)}Q${fmt(x)} ${fmt(bottom)} ${fmt(x)} ${fmt(bottom - radius)}V${fmt(y + radius)}Q${fmt(x)} ${fmt(y)} ${fmt(x + radius)} ${fmt(y)}Z`;
}
