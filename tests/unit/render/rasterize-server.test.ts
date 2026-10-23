import sharp, { type OutputInfo } from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import type { RenderResult } from '../../../lib/render/types';
import { rasterize } from '../../../server/render/rasterize';
import { renderOg } from '../../../server/render/og';

vi.mock('server-only', () => ({}));

function result(body = '<rect width="40" height="40" fill="#ff0000"/>'): RenderResult {
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">${body}</svg>`,
    width: 40,
    height: 40,
    grain: 0,
    noiseSeed: 1,
    warnings: [],
  };
}

async function rgba(bytes: Uint8Array): Promise<{ data: Buffer; info: OutputInfo }> {
  return sharp(Buffer.from(bytes)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function pixel(image: { data: Buffer; info: OutputInfo }, x: number, y: number): number[] {
  const offset = (y * image.info.width + x) * 4;
  return [...image.data.subarray(offset, offset + 4)];
}

async function photo(): Promise<Buffer> {
  const pixels = Buffer.alloc(80 * 40 * 3);
  for (let y = 0; y < 40; y += 1)
    for (let x = 0; x < 80; x += 1) {
      pixels[(y * 80 + x) * 3 + (x < 40 ? 0 : 2)] = 255;
    }
  return sharp(pixels, { raw: { width: 80, height: 40, channels: 3 } })
    .png()
    .toBuffer();
}

function photoResult(focalX: number, body = ''): RenderResult {
  return {
    ...result(body),
    background: {
      kind: 'image',
      assetKey: 'uploads/wallpapers/00000000-0000-0000-0000-000000000000/full.jpg',
      focalX,
      focalY: 0.5,
      dim: 0.25,
    },
  };
}

describe('server rasterization', () => {
  it('renders requested dimensions and PNG, WebP and 4:4:4 JPEG formats', async () => {
    const png = await rasterize(result(), { w: 72, h: 48, format: 'png' });
    expect(pixel(await rgba(png), 30, 24)).toEqual([255, 0, 0, 255]);
    for (const format of ['png', 'webp', 'jpeg'] as const) {
      const bytes = format === 'png' ? png : await rasterize(result(), { w: 72, h: 48, format });
      const meta = await sharp(bytes).metadata();
      expect([meta.width, meta.height, meta.format]).toEqual([72, 48, format]);
      if (format === 'jpeg') expect(meta.chromaSubsampling).toBe('4:4:4');
    }
  });

  it('covers at each focal point and applies the SVG dim exactly once', async () => {
    const bytes = await photo();
    const left = photoResult(0, '<rect width="40" height="40" fill="black" opacity="0.25"/>');
    const right = photoResult(1);
    const red = pixel(
      await rgba(await rasterize(left, { w: 40, h: 40, format: 'png', focalBackground: bytes })),
      20,
      20,
    );
    expect(red[0]).toBeGreaterThanOrEqual(190);
    expect(red[0]).toBeLessThanOrEqual(192);
    expect(red.slice(1)).toEqual([0, 0, 255]);
    expect(
      pixel(
        await rgba(await rasterize(right, { w: 40, h: 40, format: 'png', focalBackground: bytes })),
        20,
        20,
      ),
    ).toEqual([0, 0, 255, 255]);
  });

  it.each(['rounded', 'circle', 'squircle'] as const)(
    'keeps %s photo alpha unchanged when adding grain',
    async (shape) => {
      const source = photoResult(0);
      if (!source.background) throw new Error('Expected photo fixture');
      source.background.placement = { x: 4, y: 4, w: 32, h: 32, shape, radius: 10 };
      const options = {
        w: 80,
        h: 80,
        format: 'png' as const,
        focalBackground: await sharp(await photo())
          .modulate({ brightness: 0.6 })
          .png()
          .toBuffer(),
      };
      const plain = await rgba(await rasterize(source, options));
      const grained = await rgba(await rasterize({ ...source, grain: 0.9 }, options));
      expect(pixel(grained, 0, 0)[3]).toBe(0);
      expect(pixel(grained, 8, 8)[3]).toBe(0);
      expect(pixel(grained, 40, 40)[3]).toBe(255);
      expect([...grained.data].filter((_, index) => index % 4 === 3)).toEqual(
        [...plain.data].filter((_, index) => index % 4 === 3),
      );
      expect(grained.data).not.toEqual(plain.data);
    },
  );

  it('composes ordered independent photo crops instead of rasterizing the parent SVG', async () => {
    const tree: RenderResult = {
      ...result('<rect width="40" height="40" fill="#00ff00"/>'),
      layers: [
        { x: 0, y: 0, w: 20, h: 40, result: photoResult(0) },
        { x: 20, y: 0, w: 20, h: 40, result: photoResult(1) },
        {
          x: 10,
          y: 10,
          w: 20,
          h: 20,
          result: result('<rect width="40" height="40" fill="#ffffff"/>'),
        },
      ],
    };
    const output = await rgba(
      await rasterize(tree, { w: 80, h: 80, format: 'png', focalBackground: await photo() }),
    );
    expect(pixel(output, 10, 40)).toEqual([255, 0, 0, 255]);
    expect(pixel(output, 70, 40)).toEqual([0, 0, 255, 255]);
    expect(pixel(output, 40, 40)).toEqual([255, 255, 255, 255]);
  });

  it('anchors the deterministic grain tile at the canvas origin at different export sizes', async () => {
    const source = { ...result('<rect width="40" height="40" fill="#808080"/>'), grain: 0.8 };
    const small = await rgba(await rasterize(source, { w: 64, h: 64, format: 'png' }));
    const large = await rgba(await rasterize(source, { w: 192, h: 192, format: 'png' }));
    for (const [x, y] of [
      [0, 0],
      [8, 4],
      [63, 63],
    ] as const)
      expect(pixel(small, x, y)).toEqual(pixel(large, x, y));
  });

  it('clips a whole composition layer and trims children extending beyond the canvas', async () => {
    const tree: RenderResult = {
      ...result(),
      layers: [{ x: -10, y: -10, w: 30, h: 30, shape: 'circle', result: result() }],
    };
    const output = await rgba(await rasterize(tree, { w: 40, h: 40, format: 'png' }));
    expect(pixel(output, 5, 5)).toEqual([255, 0, 0, 255]);
    expect(pixel(output, 19, 19)[3]).toBe(0);
    expect(pixel(output, 30, 30)[3]).toBe(0);
  });

  it('fails explicitly for missing photos and rejects invalid sizes or recursive trees', async () => {
    await expect(rasterize(photoResult(0), { w: 40, h: 40, format: 'png' })).rejects.toThrow(
      'focalBackground',
    );
    for (const [w, h] of [
      [0, 1],
      [1.5, 20],
      [Infinity, 1],
      [NaN, 1],
      [4096, 4096],
    ]) {
      await expect(rasterize(result(), { w: w ?? 0, h: h ?? 0, format: 'png' })).rejects.toThrow();
    }
    const cyclic = result();
    cyclic.layers = [{ x: 0, y: 0, w: 40, h: 40, result: cyclic }];
    await expect(rasterize(cyclic, { w: 40, h: 40, format: 'png' })).rejects.toThrow('cycles');
    let deep = result();
    for (let i = 0; i < 9; i += 1)
      deep = { ...result(), layers: [{ x: 0, y: 0, w: 40, h: 40, result: deep }] };
    await expect(rasterize(deep, { w: 40, h: 40, format: 'png' })).rejects.toThrow('complex');
  });
});

describe('Open Graph rendering', () => {
  it('renders both preview images into a 1200 × 630 JPEG', async () => {
    const red = await rasterize(result(), { w: 40, h: 80, format: 'png' });
    const blue = await rasterize(result('<rect width="40" height="40" fill="#0000ff"/>'), {
      w: 40,
      h: 80,
      format: 'png',
    });
    const output = await renderOg(red, blue, {
      mode: 'light',
      bg: '#fffaf5',
      surface: '#ffffff',
      primary: '#8844bb',
      accent: '#ffbb66',
      ink: '#221133',
      inkMuted: '#776688',
    });
    expect(await sharp(output).metadata()).toMatchObject({
      width: 1200,
      height: 630,
      format: 'jpeg',
      chromaSubsampling: '4:4:4',
    });
    const pixels = await rgba(output);
    expect(pixel(pixels, 730, 220)[0]).toBeGreaterThan(240);
    expect(pixel(pixels, 730, 220)[2]).toBeLessThan(10);
    expect(pixel(pixels, 1000, 260)[2]).toBeGreaterThan(240);
    expect(pixel(pixels, 1000, 260)[0]).toBeLessThan(10);
  });
});
