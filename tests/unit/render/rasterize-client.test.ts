import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rasterizeInBrowser } from '../../../lib/client/rasterize';
import type { RenderResult } from '../../../lib/render/types';

vi.mock('../../../lib/env.client', () => ({
  env: { NEXT_PUBLIC_CDN_URL: 'https://cdn.example.test/base' },
}));

const canvases: FakeCanvas[] = [];
const images: FakeImage[] = [];
let decode: () => Promise<void>;
let encodedBlob: Blob | null;

class FakeContext {
  constructor(readonly canvas: FakeCanvas) {}
  data = new Uint8ClampedArray();
  globalCompositeOperation = 'source-over';
  fillStyle: unknown;
  save = vi.fn();
  restore = vi.fn();
  scale = vi.fn();
  beginPath = vi.fn();
  ellipse = vi.fn();
  rect = vi.fn();
  clip = vi.fn();
  drawImage = vi.fn(() => {
    this.data = new Uint8ClampedArray(this.canvas.width * this.canvas.height * 4);
    this.data[7] = 128;
  });
  getImageData = vi.fn(() => ({
    data: this.data.slice(),
    width: this.canvas.width,
    height: this.canvas.height,
  }));
  createImageData = vi.fn((w: number, h: number) => ({
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
  }));
  putImageData = vi.fn((image: { data: Uint8ClampedArray }) => {
    this.data = image.data.slice();
  });
  createPattern = vi.fn(() => ({}));
  fillRect = vi.fn(() => {
    for (let index = 3; index < this.data.length; index += 4) this.data[index] = 255;
  });
}

class FakeCanvas {
  width = 0;
  height = 0;
  context = new FakeContext(this);
  getContext = vi.fn(() => this.context);
  toBlob = vi.fn((callback: (blob: Blob | null) => void) => callback(encodedBlob));
}

class FakeImage {
  src = '';
  constructor() {
    images.push(this);
  }
  decode(): Promise<void> {
    return decode();
  }
}

function result(): RenderResult {
  return {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>',
    width: 40,
    height: 40,
    grain: 0,
    noiseSeed: 1,
    warnings: [],
  };
}

function photoResult(): RenderResult {
  return {
    ...result(),
    background: {
      kind: 'image',
      assetKey: 'uploads/wallpapers/00000000-0000-0000-0000-000000000000/full.jpg',
      focalX: 1,
      focalY: 0.5,
      dim: 0.3,
      placement: { x: 4, y: 4, w: 32, h: 32, shape: 'circle' },
    },
  };
}

beforeEach(() => {
  canvases.length = images.length = 0;
  decode = () => Promise.resolve();
  encodedBlob = new Blob(['image'], { type: 'image/png' });
  vi.stubGlobal('document', {
    createElement: vi.fn(() => {
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas;
    }),
  });
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal(
    'Path2D',
    class {
      constructor(readonly path: string) {}
    },
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-svg');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('browser rasterization lifecycle', () => {
  it('draws SVG, encodes the requested format, and releases its canvas and object URL', async () => {
    const output = await rasterizeInBrowser(result(), {
      w: 80,
      h: 40,
      type: 'image/jpeg',
      quality: 0.8,
    });
    expect(output).toBe(encodedBlob);
    expect(canvases[0]?.context.drawImage).toHaveBeenCalledWith(images[0], 0, 0, 80, 40);
    expect(canvases[0]?.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.8);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-svg');
    expect(images[0]?.src).toBe('');
    expect(canvases.map((canvas) => [canvas.width, canvas.height])).toEqual([[0, 0]]);
  });

  it('preserves original alpha after soft-light noise and releases the noise tile', async () => {
    await rasterizeInBrowser({ ...result(), grain: 0.8 }, { w: 4, h: 4, type: 'image/png' });
    expect(canvases[0]?.context.data[3]).toBe(0);
    expect(canvases[0]?.context.data[7]).toBe(128);
    expect(canvases[0]?.context.fillRect).toHaveBeenCalledWith(0, 0, 4, 4);
    expect(canvases).toHaveLength(2);
    expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });

  it('shares one local bitmap across photo layers, honors clipping/focal crop, and skips parent SVG', async () => {
    const close = vi.fn();
    const bitmap = { width: 80, height: 40, close };
    const create = vi.fn().mockResolvedValue(bitmap);
    const fetcher = vi.fn();
    vi.stubGlobal('createImageBitmap', create);
    vi.stubGlobal('fetch', fetcher);
    const tree: RenderResult = {
      ...result(),
      layers: [
        { x: 0, y: 0, w: 20, h: 40, shape: 'rounded', radius: 4, result: photoResult() },
        { x: 20, y: 0, w: 20, h: 40, result: photoResult() },
      ],
    };
    const photo = new Blob(['photo'], { type: 'image/png' });
    await rasterizeInBrowser(tree, { w: 40, h: 40, type: 'image/png', focalBackground: photo });
    expect(create).toHaveBeenCalledExactlyOnceWith(photo, { imageOrientation: 'from-image' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(images).toHaveLength(2);
    expect(canvases[0]?.context.drawImage).toHaveBeenNthCalledWith(1, canvases[1], 0, 0, 20, 40);
    expect(canvases[0]?.context.drawImage).toHaveBeenNthCalledWith(2, canvases[2], 20, 0, 20, 40);
    expect(canvases[0]?.context.clip).toHaveBeenCalledTimes(1);
    expect(canvases[1]?.context.drawImage).toHaveBeenNthCalledWith(
      1,
      bitmap,
      60,
      0,
      20,
      40,
      4,
      4,
      32,
      32,
    );
    expect(canvases[1]?.context.ellipse).toHaveBeenCalledWith(20, 20, 16, 16, 0, 0, Math.PI * 2);
    expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });

  it('fetches validated asset paths from the CDN origin with CORS and omitted credentials', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 40, height: 40, close }));
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(new Blob(['image'], { type: 'image/jpeg' })));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    await rasterizeInBrowser(photoResult(), {
      w: 40,
      h: 40,
      type: 'image/png',
      signal: controller.signal,
    });
    expect(fetcher).toHaveBeenCalledWith(
      new URL(
        'https://cdn.example.test/uploads/wallpapers/00000000-0000-0000-0000-000000000000/full.jpg',
      ),
      { mode: 'cors', credentials: 'omit', signal: controller.signal, cache: 'force-cache' },
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('releases decoding images and canvases when cancelled', async () => {
    let entered: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    decode = () => {
      entered();
      return new Promise<void>(() => {});
    };
    const controller = new AbortController();
    const pending = rasterizeInBrowser(result(), {
      w: 40,
      h: 40,
      type: 'image/png',
      signal: controller.signal,
    });
    await started;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-svg');
    expect(images[0]?.src).toBe('');
    expect(canvases[0]?.width).toBe(0);
  });

  it('closes a bitmap if cancellation arrives during decoding and handles encoder failure', async () => {
    let decoded: (value: { width: number; height: number; close: () => void }) => void = () => {};
    const close = vi.fn();
    let entered: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => {
        entered();
        return new Promise((resolve) => {
          decoded = resolve;
        });
      }),
    );
    const controller = new AbortController();
    const pending = rasterizeInBrowser(photoResult(), {
      w: 40,
      h: 40,
      type: 'image/png',
      signal: controller.signal,
      focalBackground: new Blob(['image'], { type: 'image/png' }),
    });
    await started;
    controller.abort();
    decoded({ width: 40, height: 40, close });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(close).toHaveBeenCalledTimes(1);
    encodedBlob = null;
    await expect(rasterizeInBrowser(result(), { w: 40, h: 40, type: 'image/png' })).rejects.toThrow(
      'encode',
    );
    expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });

  it('rejects invalid dimensions, photo sources, cycles, and pre-aborted jobs before allocating a canvas', async () => {
    const invalidPhoto = new Blob(['<svg/>'], { type: 'image/svg+xml' });
    for (const [w, h] of [
      [0, 1],
      [NaN, 1],
      [Infinity, 1],
      [1.5, 1],
      [4096, 4096],
    ]) {
      await expect(
        rasterizeInBrowser(result(), { w: w ?? 0, h: h ?? 0, type: 'image/png' }),
      ).rejects.toThrow();
    }
    await expect(
      rasterizeInBrowser(result(), {
        w: 40,
        h: 40,
        type: 'image/png',
        focalBackground: invalidPhoto,
      }),
    ).rejects.toThrow('Photo');
    const invalidKey = photoResult();
    if (invalidKey.background) invalidKey.background.assetKey = '../secrets.jpg';
    await expect(
      rasterizeInBrowser(invalidKey, { w: 40, h: 40, type: 'image/png' }),
    ).rejects.toThrow();
    const cycle = result();
    cycle.layers = [{ x: 0, y: 0, w: 40, h: 40, result: cycle }];
    await expect(rasterizeInBrowser(cycle, { w: 40, h: 40, type: 'image/png' })).rejects.toThrow(
      'cycles',
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      rasterizeInBrowser(result(), { w: 40, h: 40, type: 'image/png', signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(canvases).toHaveLength(0);
  });
});
