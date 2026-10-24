import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { APPS } from '../../content/apps';
import { renderHomePreview } from '../../lib/render/preview';
import { GlyphName, themeSpecSchema, type ThemeSpec } from '../../lib/render/spec';
import { loadServerGlyphs } from './glyphs';
import { fingerprintWallpaper } from './duplicate';
import { rasterize } from './rasterize';

const manifestSchema = z
  .array(z.object({ name: GlyphName.refine((name) => !/\s/.test(name)) }))
  .min(1)
  .max(2000)
  .refine((entries) => new Set(entries.map(({ name }) => name)).size === entries.length, {
    message: 'Glyph manifest names must be unique',
  });
let manifestPromise: Promise<ReadonlySet<string>> | undefined;

export function loadGeneratorManifest(): Promise<ReadonlySet<string>> {
  if (!manifestPromise) {
    const file = path.resolve(process.cwd(), 'public', 'glyphs', 'v1', 'manifest.json');
    manifestPromise = readFile(file, 'utf8')
      .then((source): ReadonlySet<string> => {
        const value: unknown = JSON.parse(source);
        return new Set(manifestSchema.parse(value).map(({ name }) => name));
      })
      .catch((error: unknown) => {
        manifestPromise = undefined;
        throw error;
      });
  }
  return manifestPromise;
}

export async function renderGeneratorPreview(
  input: ThemeSpec,
): Promise<{ bytes: Uint8Array; previewHash: string }> {
  const spec = themeSpecSchema.parse(input);
  const glyphs = await loadServerGlyphs();
  const dimensions = { w: 72, h: 156 };
  const rendered = await rasterize(renderHomePreview(spec, glyphs, APPS, dimensions), {
    ...dimensions,
    format: 'png',
  });
  // Home previews have an opaque canvas; omit its unused alpha channel from stored thumbnails.
  const bytes = await sharp(rendered).removeAlpha().png().toBuffer();
  return { bytes, previewHash: await fingerprintWallpaper(spec, glyphs) };
}
