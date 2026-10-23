import { z } from 'zod';
import { roundedRectPath, superellipsePath } from '../render/geometry';
import { noiseTile } from '../render/noise';
import { AssetKey, Unit } from '../render/spec';
import type { ImageBackground, ImagePlacement, RenderResult } from '../render/types';

const MAX_PIXELS = 16_700_000;
const dimension = z.number().int().positive().max(MAX_PIXELS);
const coordinateSize = z.number().finite().positive().max(MAX_PIXELS);
const placementSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  w: coordinateSize,
  h: coordinateSize,
  shape: z.enum(['square', 'rounded', 'circle', 'squircle']).optional(),
  radius: z.number().finite().nonnegative().optional(),
});
const resultSchema = z.object({
  svg: z.string().min(1),
  width: coordinateSize,
  height: coordinateSize,
  grain: Unit,
  noiseSeed: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
  background: z
    .object({
      kind: z.literal('image'),
      assetKey: AssetKey,
      focalX: Unit,
      focalY: Unit,
      dim: z.number().min(0).max(0.6),
      placement: placementSchema.optional(),
    })
    .optional(),
  layers: z.array(z.unknown()).max(128).optional(),
});
const optionsSchema = z.object({
  w: dimension,
  h: dimension,
  type: z.enum(['image/png', 'image/jpeg']),
  quality: Unit.optional(),
  signal: z.instanceof(AbortSignal).optional(),
  focalBackground: z
    .instanceof(Blob)
    .refine(
      (blob) =>
        ['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) &&
        blob.size > 0 &&
        blob.size <= 15 * 1024 * 1024,
      'Photo must be JPEG, PNG, or WebP and at most 15 MiB',
    )
    .optional(),
});

export interface BrowserRasterizeOptions {
  w: number;
  h: number;
  type: 'image/png' | 'image/jpeg';
  quality?: number;
  signal?: AbortSignal;
  focalBackground?: Blob;
}

interface RenderContext {
  options: BrowserRasterizeOptions;
  bitmaps: Map<string, Promise<ImageBitmap>>;
  pixels: number;
  rendered: number;
}

function checkPixels(w: number, h: number): void {
  if (w * h > MAX_PIXELS) throw new RangeError('Raster dimensions exceed 16.7 million pixels');
}

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  assertActive(signal);
  return new Promise<T>((resolve, reject) => {
    const aborted = (): void =>
      reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    signal.addEventListener('abort', aborted, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

function parseTree(
  value: unknown,
  depth = 0,
  budget = { nodes: 128 },
  ancestors = new Set<object>(),
): RenderResult {
  if (depth > 8 || --budget.nodes < 0) throw new RangeError('Render composition is too complex');
  if (typeof value === 'object' && value !== null && ancestors.has(value))
    throw new TypeError('Render composition must not contain cycles');
  if (typeof value === 'object' && value !== null) ancestors.add(value);
  try {
    const { layers, ...leaf } = resultSchema.parse(value);
    checkPixels(leaf.width, leaf.height);
    if (layers === undefined) return leaf;
    return {
      ...leaf,
      layers: layers.map((entry) => {
        const { result, ...placement } = placementSchema
          .extend({ result: z.unknown() })
          .parse(entry);
        return { ...placement, result: parseTree(result, depth + 1, budget, ancestors) };
      }),
    };
  } finally {
    if (typeof value === 'object' && value !== null) ancestors.delete(value);
  }
}

function clip(ctx: CanvasRenderingContext2D, placement: ImagePlacement): void {
  if (placement.shape === 'squircle') {
    ctx.clip(new Path2D(superellipsePath(placement.x, placement.y, placement.w, placement.h)));
  } else if (placement.shape === 'rounded') {
    ctx.clip(
      new Path2D(
        roundedRectPath(
          placement.x,
          placement.y,
          placement.w,
          placement.h,
          placement.radius ?? Math.min(placement.w, placement.h) * 0.22,
        ),
      ),
    );
  } else {
    ctx.beginPath();
    if (placement.shape === 'circle') {
      ctx.ellipse(
        placement.x + placement.w / 2,
        placement.y + placement.h / 2,
        placement.w / 2,
        placement.h / 2,
        0,
        0,
        Math.PI * 2,
      );
    } else ctx.rect(placement.x, placement.y, placement.w, placement.h);
    ctx.clip();
  }
}

async function photoBitmap(
  background: ImageBackground,
  context: RenderContext,
): Promise<ImageBitmap> {
  const key = context.options.focalBackground ? 'local-photo' : AssetKey.parse(background.assetKey);
  let request = context.bitmaps.get(key);
  if (!request) {
    request = (async (): Promise<ImageBitmap> => {
      const { signal, focalBackground } = context.options;
      let blob = focalBackground;
      if (!blob) {
        const { env } = await import('../env.client');
        const origin = new URL(env.NEXT_PUBLIC_CDN_URL).origin;
        const response = await fetch(new URL(`/${key}`, origin), {
          mode: 'cors',
          credentials: 'omit',
          signal,
          cache: 'force-cache',
        });
        if (!response.ok) throw new Error(`Photo request failed (${response.status})`);
        blob = await response.blob();
      }
      assertActive(signal);
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      try {
        assertActive(signal);
        checkPixels(bitmap.width, bitmap.height);
        if (bitmap.width <= 0 || bitmap.height <= 0)
          throw new Error('Photo has invalid dimensions');
        return bitmap;
      } catch (error) {
        bitmap.close();
        throw error;
      }
    })();
    context.bitmaps.set(key, request);
  }
  return request;
}

async function drawPhoto(
  ctx: CanvasRenderingContext2D,
  background: ImageBackground,
  result: RenderResult,
  w: number,
  h: number,
  context: RenderContext,
): Promise<void> {
  const photo = await photoBitmap(background, context);
  assertActive(context.options.signal);
  const placement = background.placement ?? { x: 0, y: 0, w: result.width, h: result.height };
  const width = Math.max(1, Math.round((placement.w * w) / result.width));
  const height = Math.max(1, Math.round((placement.h * h) / result.height));
  checkPixels(width, height);
  const scale = Math.max(width / photo.width, height / photo.height);
  const cropWidth = Math.max(1, Math.min(photo.width, Math.round(width / scale)));
  const cropHeight = Math.max(1, Math.min(photo.height, Math.round(height / scale)));
  const left = Math.max(
    0,
    Math.min(photo.width - cropWidth, Math.round(background.focalX * photo.width - cropWidth / 2)),
  );
  const top = Math.max(
    0,
    Math.min(
      photo.height - cropHeight,
      Math.round(background.focalY * photo.height - cropHeight / 2),
    ),
  );
  ctx.save();
  try {
    ctx.scale(w / result.width, h / result.height);
    clip(ctx, placement);
    ctx.drawImage(
      photo,
      left,
      top,
      cropWidth,
      cropHeight,
      placement.x,
      placement.y,
      placement.w,
      placement.h,
    );
  } finally {
    ctx.restore();
  }
}

async function drawSvg(
  ctx: CanvasRenderingContext2D,
  result: RenderResult,
  w: number,
  h: number,
  signal?: AbortSignal,
): Promise<void> {
  const url = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml' }));
  const image = new Image();
  try {
    image.src = url;
    await abortable(image.decode(), signal);
    assertActive(signal);
    ctx.drawImage(image, 0, 0, w, h);
  } finally {
    image.src = '';
    URL.revokeObjectURL(url);
  }
}

function drawGrain(
  ctx: CanvasRenderingContext2D,
  result: RenderResult,
  w: number,
  h: number,
): void {
  const original = ctx.getImageData(0, 0, w, h);
  const tile = document.createElement('canvas');
  try {
    tile.width = tile.height = 128;
    const tileCtx = tile.getContext('2d');
    if (!tileCtx) throw new Error('Canvas 2D is unavailable');
    const pixels = tileCtx.createImageData(128, 128);
    pixels.data.set(noiseTile(result.noiseSeed, result.grain));
    tileCtx.putImageData(pixels, 0, 0);
    const pattern = ctx.createPattern(tile, 'repeat');
    if (!pattern) throw new Error('Could not create the grain pattern');
    ctx.save();
    try {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w, h);
    } finally {
      ctx.restore();
    }
    const grained = ctx.getImageData(0, 0, w, h);
    for (let index = 3; index < grained.data.length; index += 4)
      grained.data[index] = original.data[index] ?? 0;
    ctx.putImageData(grained, 0, 0);
  } finally {
    tile.width = tile.height = 0;
  }
}

async function renderNode(
  result: RenderResult,
  w: number,
  h: number,
  context: RenderContext,
): Promise<HTMLCanvasElement> {
  assertActive(context.options.signal);
  checkPixels(w, h);
  context.pixels -= w * h;
  if (context.pixels < 0) throw new RangeError('Render composition exceeds the pixel work limit');
  context.rendered += 1;
  if (context.rendered % 6 === 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assertActive(context.options.signal);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    if (result.layers !== undefined) {
      for (const layer of result.layers) {
        const width = Math.max(1, Math.round((layer.w * w) / result.width));
        const height = Math.max(1, Math.round((layer.h * h) / result.height));
        if (
          layer.x >= result.width ||
          layer.y >= result.height ||
          layer.x + layer.w <= 0 ||
          layer.y + layer.h <= 0
        )
          continue;
        const child = await renderNode(layer.result, width, height, context);
        ctx.save();
        try {
          ctx.scale(w / result.width, h / result.height);
          if (layer.shape) clip(ctx, layer);
          ctx.drawImage(child, layer.x, layer.y, layer.w, layer.h);
        } finally {
          ctx.restore();
          child.width = child.height = 0;
        }
      }
    } else {
      if (result.background) await drawPhoto(ctx, result.background, result, w, h, context);
      await drawSvg(ctx, result, w, h, context.options.signal);
    }
    if (result.grain > 0) drawGrain(ctx, result, w, h);
    return canvas;
  } catch (error) {
    canvas.width = canvas.height = 0;
    throw error;
  }
}

export async function rasterizeInBrowser(
  result: RenderResult,
  options: BrowserRasterizeOptions,
): Promise<Blob> {
  const validated = parseTree(result);
  const input = optionsSchema.parse(options);
  checkPixels(input.w, input.h);
  assertActive(input.signal);
  const context: RenderContext = {
    options: input,
    bitmaps: new Map(),
    pixels: MAX_PIXELS * 4,
    rendered: 0,
  };
  let canvas: HTMLCanvasElement | undefined;
  try {
    canvas = await renderNode(validated, input.w, input.h, context);
    assertActive(input.signal);
    const finalCanvas = canvas;
    return await abortable(
      new Promise<Blob>((resolve, reject) => {
        finalCanvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Canvas could not encode the image'))),
          input.type,
          input.quality ?? 0.92,
        );
      }),
      input.signal,
    );
  } finally {
    if (canvas) canvas.width = canvas.height = 0;
    for (const bitmap of context.bitmaps.values()) {
      try {
        (await bitmap).close();
      } catch {
        /* Failed decodes do not own a bitmap. */
      }
    }
  }
}
