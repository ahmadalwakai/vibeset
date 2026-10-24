import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { getRecipe } from '../../../content/aesthetics';
import { getPalette } from '../../../content/palettes';
import { buildSpec } from '../../../lib/render/build-spec';
import { createRng } from '../../../lib/render/prng';
import {
  loadGeneratorManifest,
  renderGeneratorPreview,
} from '../../../server/render/generator-preview';
import { dHash, hamming } from '../../../server/render/hash';
import { fingerprintWallpaper } from '../../../server/render/duplicate';
import { loadServerGlyphs } from '../../../server/render/glyphs';
import { renderPublishAssets } from '../../../server/render/publish-assets';
import type { ObjectStorage } from '../../../server/storage/r2';

vi.mock('server-only', () => ({}));

describe('real generator previews', () => {
  it('loads and memoizes the validated glyph manifest', async () => {
    const pending = loadGeneratorManifest();
    expect(loadGeneratorManifest()).toBe(pending);
    const names = await pending;
    expect(names.size).toBe(1432);
    expect(names.has('circle')).toBe(true);
    expect(names.has('apple-logo')).toBe(false);
    expect(await loadGeneratorManifest()).toBe(names);
  });

  it('renders deterministic opaque PNGs and hashes using the actual curated preview', async () => {
    const recipe = getRecipe('y2k');
    const palette = getPalette('midnight-y2k');
    if (!recipe || !palette) throw new Error('The curated Y2K fixture must exist');
    const spec = buildSpec(recipe, palette, createRng(42));
    const first = await renderGeneratorPreview(spec);
    const second = await renderGeneratorPreview(spec);
    expect(first.bytes).toEqual(second.bytes);
    expect(first.previewHash).toBe(second.previewHash);
    expect(first.previewHash).toMatch(/^[a-f0-9]{16}$/);
    expect(first.previewHash).toBe(await fingerprintWallpaper(spec, await loadServerGlyphs()));
    expect(first.previewHash).not.toBe(await dHash(first.bytes));
    expect(await sharp(first.bytes).metadata()).toMatchObject({
      format: 'png',
      width: 72,
      height: 156,
      channels: 3,
      hasAlpha: false,
    });
  }, 10_000);

  it('distinguishes wallpapers that the fixed home icon layout made near duplicates', async () => {
    const recipe = getRecipe('y2k');
    const firstPalette = getPalette('bubblegum');
    const secondPalette = getPalette('lilac-dream');
    if (!recipe || !firstPalette || !secondPalette)
      throw new Error('Curated Y2K palettes must exist');
    const first = await renderGeneratorPreview(
      buildSpec(recipe, firstPalette, createRng(20261025)),
    );
    const second = await renderGeneratorPreview(
      buildSpec(recipe, secondPalette, createRng(20261026)),
    );
    expect(hamming(await dHash(first.bytes), await dHash(second.bytes))).toBeLessThanOrEqual(6);
    expect(hamming(first.previewHash, second.previewHash)).toBeGreaterThan(6);
  }, 10_000);

  it('keeps generated and published fingerprints identical for the same curated wallpaper', async () => {
    const recipe = getRecipe('y2k');
    const palette = getPalette('midnight-y2k');
    const pattern = recipe?.wallpapers.find((choice) => choice.kind === 'pattern');
    if (!recipe || !palette || !pattern) throw new Error('The curated Y2K pattern must exist');
    const spec = buildSpec({ ...recipe, wallpapers: [pattern] }, palette, createRng(42));
    const getBytes = vi
      .fn()
      .mockRejectedValue(new Error('A generated wallpaper has no source photo'));
    const storage: ObjectStorage = {
      getBytes,
      put: vi.fn(),
      head: vi.fn(),
      deleteMany: vi.fn(),
      deletePrefix: vi.fn(),
      listPrefixes: vi.fn(),
      presignPut: vi.fn(),
    };
    const generated = await renderGeneratorPreview(spec);
    const published = await renderPublishAssets({
      themeId: '00000000-0000-4000-8000-000000000001',
      assetVersion: 1,
      attemptId: '00000000-0000-4000-8000-000000000002',
      spec,
      storage,
    });
    expect(published.previewHash).toBe(generated.previewHash);
    expect(getBytes).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  }, 30_000);
});
