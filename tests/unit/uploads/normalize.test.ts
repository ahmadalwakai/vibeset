import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { normalizeUpload } from '../../../server/render/upload-image';
import { extractPhotoPalette } from '../../../server/render/palette-extract';
import { derivePhotoPalette } from '../../../lib/render/photo-palette';
import { contrast } from '../../../lib/render/color';
import { uploadDimensionsReason, MAX_UPLOAD_BYTES, rasterContentType } from '../../../lib/uploads';
import { createUploadSchema, uploadReservationSchema } from '../../../lib/validation/uploads';

vi.mock('server-only', () => ({}));
async function image(width: number, height: number, color = '#ff0000'): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();
}

describe('upload boundaries and purpose-specific geometry', () => {
  it('uses decimal15MB and supports only canonical content types', () => {
    expect(
      createUploadSchema.safeParse({ contentType: 'image/jpeg', bytes: MAX_UPLOAD_BYTES }).success,
    ).toBe(true);
    expect(
      createUploadSchema.safeParse({ contentType: 'image/jpeg', bytes: MAX_UPLOAD_BYTES + 1 })
        .success,
    ).toBe(false);
    for (const contentType of ['image/svg+xml', 'image/heic', 'image/gif', 'image/jpeg\n'])
      expect(createUploadSchema.safeParse({ contentType, bytes: 1 }).success).toBe(false);
    expect(
      uploadReservationSchema.safeParse({
        uploadId: '11111111-1111-4111-8111-111111111111',
        url: 'invalid',
        headers: { 'Content-Type': 'image/jpeg' },
      }).success,
    ).toBe(false);
  });
  it('accepts portrait/64MP boundary geometry and treats avatars independently', () => {
    expect(uploadDimensionsReason(1080, 1920, 'wallpaper')).toBeNull();
    expect(uploadDimensionsReason(1079, 1920, 'wallpaper')).toBe('too_small');
    expect(uploadDimensionsReason(1400, 1920, 'wallpaper')).toBe('bad_aspect');
    expect(uploadDimensionsReason(3200, 8000, 'wallpaper')).toBeNull();
    expect(uploadDimensionsReason(256, 256, 'avatar')).toBeNull();
    expect(uploadDimensionsReason(255, 1000, 'avatar')).toBe('too_small');
    expect(uploadDimensionsReason(8000, 8000, 'avatar')).toBeNull();
    expect(uploadDimensionsReason(8001, 8000, 'avatar')).toBe('too_large');
  });
});

describe('native upload normalization', () => {
  it('orients source metadata before validating and strips EXIF/ICC from full and preview', async () => {
    const bytes = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: '#44aabb' },
    })
      .withMetadata({ orientation: 6, exif: { IFD0: { Artist: 'Private GPS fixture' } } })
      .jpeg()
      .toBuffer();
    const output = await normalizeUpload(bytes, 'image/jpeg', 'wallpaper');
    expect([output.width, output.height]).toEqual([1080, 1920]);
    const full = await sharp(output.full).metadata(),
      preview = await sharp(output.preview).metadata();
    expect(full.format).toBe('jpeg');
    expect(full.exif).toBeUndefined();
    expect(full.icc).toBeUndefined();
    expect(full.orientation).toBeUndefined();
    expect(preview.format).toBe('webp');
    expect(preview.height).toBe(780);
    expect(preview.exif).toBeUndefined();
    expect(output.palette.length).toBeGreaterThanOrEqual(1);
    expect(output.palette.length).toBeLessThanOrEqual(6);
  });
  it('caps full height, preserves aspect, and emits immutable avatar bytes deterministically', async () => {
    const full = await normalizeUpload(await image(1800, 3000), 'image/png', 'wallpaper');
    expect(full.height).toBe(2868);
    expect(full.width).toBe(1721);
    const bytes = await image(600, 300);
    const one = await normalizeUpload(bytes, 'image/png', 'avatar'),
      two = await normalizeUpload(bytes, 'image/png', 'avatar');
    expect(one.full).toEqual(two.full);
    expect(one.preview).toEqual(one.full);
    expect([one.width, one.height]).toEqual([256, 256]);
    expect((await sharp(one.full).metadata()).format).toBe('webp');
  });
  it('rejects vector/GIF/spoofed formats and incorrect dimensions without writing content', async () => {
    await expect(
      normalizeUpload(new TextEncoder().encode('<svg/>'), 'image/png', 'wallpaper'),
    ).rejects.toMatchObject({ reason: 'unsupported' });
    await expect(
      normalizeUpload(await image(1080, 1920), 'image/jpeg', 'wallpaper'),
    ).rejects.toMatchObject({ reason: 'unsupported' });
    await expect(
      normalizeUpload(await image(100, 200), 'image/png', 'wallpaper'),
    ).rejects.toMatchObject({ reason: 'too_small' });
    await expect(
      normalizeUpload(await image(1800, 1920), 'image/png', 'wallpaper'),
    ).rejects.toMatchObject({ reason: 'bad_aspect' });
    const gif = await sharp(await image(256, 256))
      .gif()
      .toBuffer();
    expect(rasterContentType(gif)).toBeNull();
    await expect(normalizeUpload(gif, 'image/png', 'avatar')).rejects.toMatchObject({
      reason: 'unsupported',
    });
  });
  it('rejects animated WebP rather than accepting the first frame', async () => {
    const one = await image(256, 256),
      two = await image(256, 256, '#0000ff');
    const animated = await sharp([one, two], { join: { animated: true } })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2);
    await expect(normalizeUpload(animated, 'image/webp', 'avatar')).rejects.toMatchObject({
      reason: 'unsupported',
    });
  });
});

describe('deterministic photo palette', () => {
  it('extracts1..6unique colours in population order and is stable on repeated content', async () => {
    const red = await image(64, 64);
    expect(await extractPhotoPalette(red)).toEqual(['#ff0000']);
    const blue = await image(16, 64, '#0000ff');
    const bytes = await sharp(red)
      .composite([{ input: blue, left: 0, top: 0 }])
      .png()
      .toBuffer();
    const palette = await extractPhotoPalette(bytes);
    expect(palette[0]).toBe('#ff0000');
    expect(palette).toEqual(await extractPhotoPalette(bytes));
    expect(new Set(palette).size).toBe(palette.length);
  });
  it.each(
    [['#ffffff'], ['#000000'], ['#888888'], ['#b4a5f6', '#fd45d2', '#0b1526']].map((colors) => ({
      colors,
    })),
  )('derives usable roles and4.5contrast for%s', ({ colors }) => {
    const palette = derivePhotoPalette(colors);
    expect(palette.bg).toBe(colors[0]);
    expect(contrast(palette.ink, palette.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.inkMuted, palette.bg)).toBeGreaterThanOrEqual(4.5);
    expect(palette.surface).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette.accent).toMatch(/^#[0-9a-f]{6}$/);
  });
});
