import { z } from 'zod';
import { themeSpecSchema, type ThemeSpec } from '../render/spec';
import { MAX_STUDIO_DRAFT_LENGTH, MAX_STUDIO_URL_LENGTH, type StudioShareResult } from '../studio';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-';
const compressedSchema = z
  .string()
  .min(1)
  .max(MAX_STUDIO_URL_LENGTH)
  .regex(/^[A-Za-z0-9+-]+$/);
const shareOptionsSchema = z.strictObject({
  baseUrl: z
    .url()
    .max(MAX_STUDIO_URL_LENGTH)
    .refine((value) => {
      try {
        const url = new URL(value);
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
      } catch {
        return false;
      }
    }),
  locale: z.enum(['en', 'ar']).optional(),
});

/* Bounded adaptation of lz-string's decoder. The library decoder has no output cap.
 * MIT License
 * Copyright (c) 2013 pieroxy
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
function boundedDecompress(input: string): string | null {
  let bit = 0;
  const read = (count: number): number => {
    let value = 0;
    for (let i = 0; i < count; i += 1) {
      const character = input[Math.floor(bit / 6)];
      if (character === undefined) throw new RangeError('Truncated Studio link');
      const code = alphabet.indexOf(character);
      if (code < 0) throw new RangeError('Invalid Studio link');
      if (code & (32 >> (bit % 6))) value += 2 ** i;
      bit += 1;
    }
    return value;
  };
  const first = read(2);
  if (first > 1) return first === 2 ? '' : null;
  let previous = String.fromCharCode(read(first === 0 ? 8 : 16));
  const dictionary: (string | undefined)[] = [undefined, undefined, undefined, previous];
  const chunks = [previous];
  let size = 4;
  let width = 3;
  let remaining = 4;
  let length = previous.length;
  for (;;) {
    let code = read(width);
    if (code === 2) return chunks.join('');
    if (code === 0 || code === 1) {
      dictionary[size] = String.fromCharCode(read(code === 0 ? 8 : 16));
      code = size++;
      remaining -= 1;
    }
    if (remaining === 0) {
      remaining = 2 ** width;
      width += 1;
    }
    const entry = dictionary[code] ?? (code === size ? previous + previous.charAt(0) : null);
    if (entry === null || length + entry.length > MAX_STUDIO_DRAFT_LENGTH) return null;
    length += entry.length;
    chunks.push(entry);
    dictionary[size++] = previous + entry.charAt(0);
    remaining -= 1;
    previous = entry;
    if (remaining === 0) {
      remaining = 2 ** width;
      width += 1;
    }
  }
}

function hasPhoto(spec: ThemeSpec): boolean {
  return spec.wallpaper.kind === 'image' || spec.lockWallpaper?.kind === 'image';
}

export async function prepareStudioShareUrl(
  spec: ThemeSpec,
  options: { baseUrl: string; locale?: 'en' | 'ar' },
): Promise<StudioShareResult> {
  const parsed = themeSpecSchema.safeParse(spec);
  const config = shareOptionsSchema.safeParse(options);
  if (!parsed.success || !config.success) return { ok: false, reason: 'invalid' };
  if (hasPhoto(parsed.data)) return { ok: false, reason: 'photo' };
  const json = JSON.stringify(parsed.data);
  if (json.length > MAX_STUDIO_DRAFT_LENGTH) return { ok: false, reason: 'too-large' };
  try {
    const { default: codec } = await import('lz-string');
    const compressed = codec.compressToEncodedURIComponent(json);
    const url = new URL(
      config.data.locale === 'ar' ? '/ar/studio' : '/studio',
      config.data.baseUrl,
    );
    url.searchParams.set('s', compressed);
    return url.href.length <= MAX_STUDIO_URL_LENGTH
      ? { ok: true, url: url.href }
      : { ok: false, reason: 'too-large' };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

/** Bound compressed input and expanded JSON before parsing; reject noncanonical/trailing data. */
export async function decodeStudioShare(value: string): Promise<ThemeSpec | null> {
  const compressed = compressedSchema.safeParse(value);
  if (!compressed.success) return null;
  try {
    const json = boundedDecompress(compressed.data);
    if (!json) return null;
    const { default: codec } = await import('lz-string');
    if (codec.compressToEncodedURIComponent(json) !== value) return null;
    const data: unknown = JSON.parse(json);
    const parsed = themeSpecSchema.safeParse(data);
    return parsed.success && !hasPhoto(parsed.data) ? parsed.data : null;
  } catch {
    return null;
  }
}
