import { z } from 'zod';
import type { GlyphManifestEntry } from '../icon-export';
import { glyphNameSchema } from '../validation/icon-export';

const manifestSchema = z
  .array(
    z.object({
      name: glyphNameSchema,
      categories: z.array(z.string().min(1).max(120)).max(30),
      tags: z.array(z.string().min(1).max(160)).max(100),
    }),
  )
  .max(2000)
  .refine((entries) => new Set(entries.map(({ name }) => name)).size === entries.length);
let pending: Promise<readonly GlyphManifestEntry[]> | null = null;

export function loadGlyphManifest(signal?: AbortSignal): Promise<readonly GlyphManifestEntry[]> {
  if (signal?.aborted)
    return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  if (!pending) {
    const request = (async (): Promise<readonly GlyphManifestEntry[]> => {
      const response = await fetch('/glyphs/v1/manifest.json');
      if (!response.ok) throw new Error('Glyph metadata unavailable');
      const text = await response.text();
      if (text.length > 1_048_576) throw new Error('Glyph metadata is too large');
      const value: unknown = JSON.parse(text);
      return manifestSchema.parse(value);
    })();
    pending = request;
    void request.catch(() => {
      if (pending === request) pending = null;
    });
  }
  const request = pending;
  if (!signal) return request;
  return new Promise((resolve, reject) => {
    const abort = (): void => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    void request.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function fold(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}|\u0640/gu, '')
    .toLocaleLowerCase('en')
    .trim();
}

export function searchGlyphManifest(
  entries: readonly GlyphManifestEntry[],
  query: string,
): { entries: readonly GlyphManifestEntry[]; total: number } {
  const tokens = fold(query).split(/\s+/u).filter(Boolean);
  const matches = entries.filter((entry) => {
    const fields = [entry.name, ...entry.categories, ...entry.tags].map(fold);
    return tokens.every((token) => fields.some((field) => field.includes(token)));
  });
  return { entries: matches.slice(0, 120), total: matches.length };
}
