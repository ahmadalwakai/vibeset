import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import manifest from '../../app/manifest';

describe('installable brand assets', () => {
  it('provides real opaque PNGs at the declared manifest and Apple icon sizes', async () => {
    const icons = manifest().icons ?? [];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      const pixels = await sharp(path.join('public', icon.src)).metadata();
      expect(`${pixels.width}x${pixels.height}`).toBe(icon.sizes);
      expect(pixels.format).toBe('png');
      expect(pixels.hasAlpha).toBe(false);
      expect(pixels.icc?.byteLength).toBeGreaterThan(0);
    }
    for (const [file, size] of [
      ['app/icon.png', 512],
      ['app/apple-icon.png', 180],
      ['public/brand/app-icon-1024.png', 1024],
    ] as const) {
      expect(await sharp(file).metadata()).toMatchObject({
        width: size,
        height: size,
        format: 'png',
        hasAlpha: false,
      });
    }
  });

  it('keeps the complete white brand mark inside the maskable safe circle', async () => {
    const icon = manifest().icons?.find((entry) => entry.purpose === 'maskable');
    if (!icon) throw new Error('A maskable icon is required');
    const { data, info } = await sharp(path.join('public', icon.src))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let markPixels = 0;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        if (
          (data[offset] ?? 0) > 245 &&
          (data[offset + 1] ?? 0) > 245 &&
          (data[offset + 2] ?? 0) > 245
        ) {
          markPixels += 1;
          expect(
            Math.hypot(x + 0.5 - info.width / 2, y + 0.5 - info.height / 2),
          ).toBeLessThanOrEqual(info.width * 0.4);
        }
      }
    }
    expect(markPixels).toBeGreaterThan(1000);
  });

  it('ships both localized social images at the social-card dimensions', async () => {
    for (const locale of ['en', 'ar']) {
      const data = await readFile(`public/og/brand-${locale}.jpg`);
      expect(await sharp(data).metadata()).toMatchObject({
        width: 1200,
        height: 630,
        format: 'jpeg',
      });
      expect(data.byteLength).toBeLessThan(200_000);
    }
  });
});
