import 'server-only';

import sharp from 'sharp';
import { z } from 'zod';

const hexHashSchema = z.string().regex(/^[0-9a-f]{16}$/i);
const nibbleBits = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4] as const;

export async function dHash(bytes: Uint8Array): Promise<string> {
  const pixels = await sharp(Buffer.from(bytes), { limitInputPixels: 16_700_000 })
    .rotate()
    .resize(9, 8, { fit: 'fill' })
    .greyscale()
    .removeAlpha()
    .raw()
    .toBuffer();
  let hash = '';
  for (let row = 0; row < 8; row += 1) {
    let value = 0;
    for (let column = 0; column < 8; column += 1) {
      const left = pixels[row * 9 + column] ?? 0;
      const right = pixels[row * 9 + column + 1] ?? 0;
      value = (value << 1) | (left > right ? 1 : 0);
    }
    hash += value.toString(16).padStart(2, '0');
  }
  return hash;
}

export function hamming(first: string, second: string): number {
  const a = hexHashSchema.parse(first);
  const b = hexHashSchema.parse(second);
  let distance = 0;
  for (let index = 0; index < a.length; index += 1) {
    const bits = Number.parseInt(a.charAt(index), 16) ^ Number.parseInt(b.charAt(index), 16);
    distance += nibbleBits[bits] ?? 0;
  }
  return distance;
}
