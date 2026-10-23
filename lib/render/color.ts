import { clampRgb, converter, formatHex, wcagContrast } from 'culori';
import type { Oklch } from 'culori';
import type { ColorFamily } from '../catalog';
export type { ColorFamily } from '../catalog';

const oklch = converter('oklch');
const oklab = converter('oklab');
const rgb = converter('rgb');
const clamp = (value: number, low = 0, high = 1): number =>
  Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));

export function toOklch(color: string): Oklch {
  const converted = oklch(color);
  if (!converted) throw new TypeError('Invalid colour');
  return { ...converted, h: converted.h ?? 0 };
}

export function mixOklab(a: string, b: string, t: number): string {
  const left = oklab(a);
  const right = oklab(b);
  if (!left || !right) throw new TypeError('Invalid colour');
  const amount = clamp(t);
  return formatHex(
    clampRgb({
      mode: 'oklab',
      l: left.l + (right.l - left.l) * amount,
      a: left.a + (right.a - left.a) * amount,
      b: left.b + (right.b - left.b) * amount,
    }),
  );
}

export function contrast(a: string, b: string): number {
  const left = rgb(a);
  const right = rgb(b);
  if (!left || !right) throw new TypeError('Invalid colour');
  return wcagContrast(left, right);
}

export function ensureContrast(fg: string, bg: string, min: number): string {
  const original = toOklch(fg);
  const target = clamp(min, 1, 21);
  const normalized = formatHex(clampRgb(original));
  if (contrast(normalized, bg) >= target) return normalized;
  const candidates: { color: string; distance: number }[] = [];
  for (const end of [0, 1]) {
    const endpoint = end === 0 ? '#000000' : '#ffffff';
    if (contrast(endpoint, bg) < target) continue;
    let low = 0;
    let high = 1;
    let best = endpoint;
    for (let step = 0; step < 24; step += 1) {
      const amount = (low + high) / 2;
      const color = formatHex(
        clampRgb({ ...original, l: original.l + (end - original.l) * amount }),
      );
      if (contrast(color, bg) >= target) {
        high = amount;
        best = color;
      } else low = amount;
    }
    candidates.push({ color: best, distance: Math.abs(toOklch(best).l - original.l) });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return (
    candidates[0]?.color ??
    (contrast('#000000', bg) >= contrast('#ffffff', bg) ? '#000000' : '#ffffff')
  );
}

export function deltaE(a: string, b: string): number {
  const left = oklab(a);
  const right = oklab(b);
  if (!left || !right) throw new TypeError('Invalid colour');
  return Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b);
}

export function colorFamilyOf(hex: string): ColorFamily {
  const { l, c, h = 0 } = toOklch(hex);
  if (c < 0.04) return l < 0.25 ? 'black' : l > 0.85 ? 'white' : 'gray';
  const hue = ((h % 360) + 360) % 360;
  if ((hue >= 345 || hue < 100) && l < 0.5 && c < 0.12) return 'brown';
  if (hue >= 345 || hue < 20) return 'red';
  if (hue < 55) return 'orange';
  if (hue < 100) return 'yellow';
  if (hue < 160) return 'green';
  if (hue < 200) return 'teal';
  if (hue < 260) return 'blue';
  if (hue < 300) return 'purple';
  return 'pink';
}

export function withAlpha(hex: string, alpha: number): string {
  const color = rgb(hex);
  if (!color) throw new TypeError('Invalid colour');
  return `rgba(${Math.round(clamp(color.r) * 255)},${Math.round(clamp(color.g) * 255)},${Math.round(clamp(color.b) * 255)},${Number(clamp(alpha).toFixed(3))})`;
}
