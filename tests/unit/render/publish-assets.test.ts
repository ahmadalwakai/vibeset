import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { playgroundStateSchema, renderSampleSpec } from '../../../content/render-sample';
import type { ObjectStorage } from '../../../server/storage/r2';
import { renderPublishAssets } from '../../../server/render/publish-assets';

vi.mock('server-only', () => ({}));

describe('published asset byte budgets', () => {
  it('fits a detailed photo thumbnail below 80,000 bytes when its q80 baseline exceeds the cap', async () => {
    let seed = 7;
    const pixels = Buffer.alloc(360 * 780 * 3);
    for (let index = 0; index < pixels.length; index += 1) {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      pixels[index] = seed >>> 24;
    }
    const photo = await sharp(pixels, { raw: { width: 360, height: 780, channels: 3 } })
      .resize(1080, 2340, { kernel: 'nearest' })
      .jpeg({ quality: 90 })
      .toBuffer();
    const spec = renderSampleSpec(
      playgroundStateSchema.parse({ kind: 'image', palette: 'midnight' }),
    );
    if (spec.wallpaper.kind !== 'image') throw new Error('Expected an image fixture');
    spec.wallpaper.dim = 0;
    const getBytes = vi.fn().mockResolvedValue(photo);
    const storage: ObjectStorage = {
      getBytes,
      put: vi.fn(),
      head: vi.fn(),
      deleteMany: vi.fn(),
      deletePrefix: vi.fn(),
      listPrefixes: vi.fn(),
      presignPut: vi.fn(),
    };
    const output = await renderPublishAssets({
      themeId: randomUUID(),
      assetVersion: 1,
      attemptId: randomUUID(),
      spec,
      storage,
    });
    const home = output.files.find(({ key }) => key === output.assets.previewHome);
    const thumb = output.files.find(({ key }) => key === output.assets.thumb);
    if (!home || !thumb) throw new Error('Expected preview and thumbnail assets');
    const baseline = await sharp(home.body)
      .resize(360, 780, { fit: 'fill' })
      .webp({ quality: 80 })
      .toBuffer();
    expect(baseline.byteLength).toBeGreaterThan(80_000);
    expect(thumb.body.byteLength).toBeLessThanOrEqual(80_000);
    expect(await sharp(thumb.body).metadata()).toMatchObject({
      width: 360,
      height: 780,
      format: 'webp',
    });
    expect(output.assets.wallpapers.phone?.bytes).toBeLessThanOrEqual(3_000_000);
    expect(output.previewHash).toMatch(/^[a-f0-9]{16}$/);
    expect(output.dominantColor).toMatch(/^#[a-f0-9]{6}$/);
    expect(getBytes).toHaveBeenCalledExactlyOnceWith(spec.wallpaper.assetKey);
    expect(storage.put).not.toHaveBeenCalled();
  }, 30_000);
});
