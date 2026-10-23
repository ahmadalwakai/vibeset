import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseGlyphRecord } from '../../lib/render/glyphs';
import { GLYPH_WEIGHTS } from '../../lib/render/spec';
import type { GlyphSource, GlyphWeight } from '../../lib/render/types';

let glyphsPromise: Promise<GlyphSource> | undefined;

export function loadServerGlyphs(): Promise<GlyphSource> {
  if (!glyphsPromise) {
    glyphsPromise = Promise.all(
      GLYPH_WEIGHTS.map(async (weight) => {
        const file = path.resolve(process.cwd(), 'public', 'glyphs', 'v1', `${weight}.json`);
        const value: unknown = JSON.parse(await readFile(file, 'utf8'));
        return [weight, parseGlyphRecord(value)] as const;
      }),
    )
      .then((entries): GlyphSource => {
        const records = new Map<GlyphWeight, Readonly<Record<string, string>>>(entries);
        return {
          get(name, weight): string | undefined {
            const record = records.get(weight);
            return record && Object.hasOwn(record, name) ? record[name] : undefined;
          },
        };
      })
      .catch((error: unknown) => {
        glyphsPromise = undefined;
        throw error;
      });
  }
  return glyphsPromise;
}
