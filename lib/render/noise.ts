import { createRng } from './prng';

export function noiseTile(seed: number, grain: number, size = 128): Uint8ClampedArray {
  const side = Math.max(1, Math.min(1024, Math.round(Number.isFinite(size) ? size : 128)));
  const intensity = Math.max(0, Math.min(1, Number.isFinite(grain) ? grain : 0));
  const rng = createRng(seed);
  const pixels = new Uint8ClampedArray(side * side * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    const value = rng.next();
    pixels[i] = pixels[i + 1] = pixels[i + 2] = Math.round(value * 255);
    pixels[i + 3] = Math.round(intensity * 255 * value);
  }
  return pixels;
}
