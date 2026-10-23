import { z } from 'zod';
import { parseGlyphRecord } from '../render/glyphs';
import { GLYPH_WEIGHTS } from '../render/spec';
import type { GlyphSource, GlyphWeight } from '../render/types';

const pending = new Map<GlyphWeight, Promise<GlyphSource>>();
const loaded = new Map<GlyphWeight, Readonly<Record<string, string>>>();
const source: GlyphSource = {
  get(name, weight): string | undefined {
    const record = loaded.get(weight);
    return record && Object.hasOwn(record, name) ? record[name] : undefined;
  },
};

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

export function loadGlyphs(weight: GlyphWeight, signal?: AbortSignal): Promise<GlyphSource> {
  const validWeight = z.enum(GLYPH_WEIGHTS).parse(weight);
  if (signal?.aborted) return Promise.reject(abortReason(signal));

  let request = pending.get(validWeight);
  if (!request) {
    request = (async (): Promise<GlyphSource> => {
      // The fetch belongs to the cache, so cancelling one caller cannot cancel others.
      const response = await fetch(`/glyphs/v1/${validWeight}.json`);
      if (!response.ok) throw new Error(`Glyph request failed (${response.status})`);
      const value: unknown = await response.json();
      loaded.set(validWeight, parseGlyphRecord(value));
      return source;
    })();
    pending.set(validWeight, request);
    const current = request;
    void request.catch(() => {
      if (pending.get(validWeight) === current) pending.delete(validWeight);
    });
  }
  if (!signal) return request;
  return new Promise<GlyphSource>((resolve, reject) => {
    const aborted = (): void => reject(abortReason(signal));
    signal.addEventListener('abort', aborted, { once: true });
    void request.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}
