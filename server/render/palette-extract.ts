import 'server-only';

import { createHash } from 'node:crypto';
import { clampRgb, converter, formatHex } from 'culori';
import type { Oklab } from 'culori';
import sharp from 'sharp';
import { createRng } from '../../lib/render/prng';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_PIXELS } from '../../lib/uploads';

const lab = converter('oklab');

/** Seeded k-means over a bounded normalized thumbnail; ties preserve original centroid order. */
export async function extractPhotoPalette(bytes: Uint8Array): Promise<string[]> {
  if (!bytes.byteLength || bytes.byteLength > MAX_UPLOAD_BYTES)
    throw new RangeError('Photo exceeds palette limits');
  const thumb = await sharp(bytes, { limitInputPixels: MAX_UPLOAD_PIXELS })
    .flatten({ background: '#ffffff' })
    .resize(64, 64, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();
  const points: Oklab[] = [];
  for (let i = 0; i < thumb.length; i += 3) {
    const point = lab({
      mode: 'rgb',
      r: (thumb[i] ?? 0) / 255,
      g: (thumb[i + 1] ?? 0) / 255,
      b: (thumb[i + 2] ?? 0) / 255,
    });
    if (point) points.push(point);
  }
  if (!points.length) throw new TypeError('Photo has no colours');
  const digest = createHash('sha256').update(bytes).digest();
  const rng = createRng(digest.readUInt32BE(0));
  const shuffled = rng.shuffle(points);
  const unique = [
    ...new Map(shuffled.map((point) => [formatHex(clampRgb(point)), point])).values(),
  ];
  let centers = unique.slice(0, 6).map((point) => ({ ...point }));
  const distance = (a: Oklab, b: Oklab): number =>
    (a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2;
  let counts = centers.map(() => 0);
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const sums = centers.map(() => ({ l: 0, a: 0, b: 0, count: 0 }));
    for (const point of points) {
      let nearest = 0,
        score = Infinity;
      centers.forEach((center, index) => {
        const value = distance(center, point);
        if (value < score) {
          score = value;
          nearest = index;
        }
      });
      const sum = sums[nearest];
      if (sum) {
        sum.l += point.l;
        sum.a += point.a;
        sum.b += point.b;
        sum.count += 1;
      }
    }
    let shift = 0;
    centers = centers.map((center, index) => {
      const sum = sums[index];
      if (!sum?.count) return center;
      const next: Oklab = {
        mode: 'oklab',
        l: sum.l / sum.count,
        a: sum.a / sum.count,
        b: sum.b / sum.count,
      };
      shift += distance(center, next);
      return next;
    });
    counts = sums.map((sum) => sum.count);
    if (shift < 1e-12) break;
  }
  const populations = new Map<string, number>();
  centers.forEach((center, index) => {
    const color = formatHex(clampRgb(center));
    const count = counts[index] ?? 0;
    if (count) populations.set(color, (populations.get(color) ?? 0) + count);
  });
  return [...populations]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([color]) => color);
}
