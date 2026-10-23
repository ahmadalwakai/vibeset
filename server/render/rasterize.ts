import 'server-only';

import { renderAsync } from '@resvg/resvg-js';
import sharp from 'sharp';
import { z } from 'zod';
import { roundedRectPath, superellipsePath } from '../../lib/render/geometry';
import { noiseTile } from '../../lib/render/noise';
import { AssetKey, Unit } from '../../lib/render/spec';
import type { ImageBackground, ImagePlacement, RenderResult } from '../../lib/render/types';
import { getFontFiles } from './fonts';

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
  format: z.enum(['png', 'jpeg', 'webp']),
  quality: z.number().int().min(1).max(100).optional(),
  focalBackground: z.instanceof(Uint8Array).optional(),
});

export interface RasterizeOptions {
  w: number;
  h: number;
  format: 'png' | 'jpeg' | 'webp';
  quality?: number;
  focalBackground?: Uint8Array;
}

function checkPixels(w: number, h: number): void {
  if (w * h > MAX_PIXELS) throw new RangeError('Raster dimensions exceed 16.7 million pixels');
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
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

async function clipImage(
  image: Buffer,
  width: number,
  height: number,
  placement: ImagePlacement,
): Promise<Buffer> {
  if (!placement.shape || placement.shape === 'square') return image;
  const path =
    placement.shape === 'squircle'
      ? `<path d="${superellipsePath(0, 0, placement.w, placement.h)}" fill="white"/>`
      : placement.shape === 'rounded'
        ? `<path d="${roundedRectPath(0, 0, placement.w, placement.h, placement.radius ?? Math.min(placement.w, placement.h) * 0.22)}" fill="white"/>`
        : `<ellipse cx="${placement.w / 2}" cy="${placement.h / 2}" rx="${placement.w / 2}" ry="${placement.h / 2}" fill="white"/>`;
  const mask = await renderAsync(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${placement.w} ${placement.h}" preserveAspectRatio="none">${path}</svg>`,
    { font: { loadSystemFonts: false } },
  );
  return sharp(image)
    .composite([{ input: mask.asPng(), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function positionImage(
  image: Buffer,
  left: number,
  top: number,
  width: number,
  height: number,
  w: number,
  h: number,
): Promise<{ input: Buffer; left: number; top: number } | null> {
  const visibleLeft = Math.max(0, left);
  const visibleTop = Math.max(0, top);
  const visibleWidth = Math.min(w, left + width) - visibleLeft;
  const visibleHeight = Math.min(h, top + height) - visibleTop;
  if (visibleWidth <= 0 || visibleHeight <= 0) return null;
  if (visibleWidth !== width || visibleHeight !== height) {
    image = await sharp(image)
      .extract({
        left: visibleLeft - left,
        top: visibleTop - top,
        width: visibleWidth,
        height: visibleHeight,
      })
      .png()
      .toBuffer();
  }
  return { input: image, left: visibleLeft, top: visibleTop };
}

async function photoLayer(
  background: ImageBackground,
  bytes: Uint8Array,
  result: RenderResult,
  w: number,
  h: number,
): Promise<{ input: Buffer; left: number; top: number } | null> {
  const placement: ImagePlacement = background.placement ?? {
    x: 0,
    y: 0,
    w: result.width,
    h: result.height,
  };
  const width = Math.max(1, Math.round((placement.w * w) / result.width));
  const height = Math.max(1, Math.round((placement.h * h) / result.height));
  checkPixels(width, height);
  const left = Math.round((placement.x * w) / result.width);
  const top = Math.round((placement.y * h) / result.height);
  const visibleLeft = Math.max(0, left);
  const visibleTop = Math.max(0, top);
  const visibleWidth = Math.min(w, left + width) - visibleLeft;
  const visibleHeight = Math.min(h, top + height) - visibleTop;
  if (visibleWidth <= 0 || visibleHeight <= 0) return null;

  const rotated = await sharp(Buffer.from(bytes), { limitInputPixels: MAX_PIXELS })
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const scale = Math.max(width / rotated.info.width, height / rotated.info.height);
  const cropWidth = clamp(Math.round(width / scale), 1, rotated.info.width);
  const cropHeight = clamp(Math.round(height / scale), 1, rotated.info.height);
  const cropLeft = clamp(
    Math.round(background.focalX * rotated.info.width - cropWidth / 2),
    0,
    rotated.info.width - cropWidth,
  );
  const cropTop = clamp(
    Math.round(background.focalY * rotated.info.height - cropHeight / 2),
    0,
    rotated.info.height - cropHeight,
  );
  let image: Buffer = await sharp(rotated.data, { raw: rotated.info })
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer();

  image = await clipImage(image, width, height, placement);
  return positionImage(image, left, top, width, height, w, h);
}

async function renderNode(
  validated: RenderResult,
  input: RasterizeOptions,
  fontFiles: string[],
  work: { pixels: number },
): Promise<Buffer> {
  checkPixels(input.w, input.h);
  work.pixels -= input.w * input.h;
  if (work.pixels < 0) throw new RangeError('Render composition exceeds the pixel work limit');
  if (validated.layers === undefined && validated.background && !input.focalBackground) {
    throw new Error('Photo rendering requires focalBackground image bytes');
  }

  const overlays: { input: Buffer; left?: number; top?: number }[] = [];
  if (validated.layers !== undefined) {
    for (const layer of validated.layers) {
      const width = Math.max(1, Math.round((layer.w * input.w) / validated.width));
      const height = Math.max(1, Math.round((layer.h * input.h) / validated.height));
      const left = Math.round((layer.x * input.w) / validated.width);
      const top = Math.round((layer.y * input.h) / validated.height);
      if (left >= input.w || top >= input.h || left + width <= 0 || top + height <= 0) continue;
      const child = await renderNode(
        layer.result,
        { ...input, w: width, h: height, format: 'png' },
        fontFiles,
        work,
      );
      const clipped = await clipImage(child, width, height, layer);
      const visible = await positionImage(clipped, left, top, width, height, input.w, input.h);
      if (visible) overlays.push(visible);
    }
  } else {
    const rendered = await renderAsync(validated.svg, {
      fitTo: { mode: 'width', value: input.w },
      font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Readex Pro' },
    });
    const svg = await sharp(rendered.asPng())
      .resize(input.w, input.h, { fit: 'fill' })
      .png()
      .toBuffer();
    const photo =
      validated.background && input.focalBackground
        ? await photoLayer(validated.background, input.focalBackground, validated, input.w, input.h)
        : null;
    if (photo) overlays.push(photo);
    overlays.push({ input: svg });
  }
  const base = sharp({
    create: {
      width: input.w,
      height: input.h,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  let image = await (overlays.length > 0 ? base.composite(overlays) : base).png().toBuffer();

  if (validated.grain > 0) {
    const alpha = await sharp(image).ensureAlpha().extractChannel('alpha').raw().toBuffer();
    const fullTile = noiseTile(validated.noiseSeed, validated.grain);
    const tileWidth = Math.min(128, input.w);
    const tileHeight = Math.min(128, input.h);
    const tile = Buffer.alloc(tileWidth * tileHeight * 4);
    for (let row = 0; row < tileHeight; row += 1) {
      tile.set(
        fullTile.subarray(row * 128 * 4, row * 128 * 4 + tileWidth * 4),
        row * tileWidth * 4,
      );
    }
    const grained = await sharp(image)
      .composite([
        {
          input: tile,
          raw: { width: tileWidth, height: tileHeight, channels: 4 },
          tile: true,
          gravity: 'northwest',
          blend: 'soft-light',
        },
      ])
      .png()
      .toBuffer();
    // Soft-light can create alpha on transparent pixels; restore the original mask exactly.
    const colors = await sharp(grained).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    image = await sharp(colors.data, { raw: colors.info })
      .joinChannel(alpha, {
        raw: { width: input.w, height: input.h, channels: 1 },
      })
      .png()
      .toBuffer();
  }

  return image;
}

export async function rasterize(result: RenderResult, options: RasterizeOptions): Promise<Buffer> {
  const validated = parseTree(result);
  const input = optionsSchema.parse(options);
  checkPixels(input.w, input.h);
  const image = await renderNode(validated, input, await getFontFiles(), {
    pixels: MAX_PIXELS * 4,
  });
  const encoder = sharp(image);
  if (input.format === 'jpeg')
    return encoder
      .jpeg({ quality: input.quality ?? 92, mozjpeg: true, chromaSubsampling: '4:4:4' })
      .toBuffer();
  if (input.format === 'webp') return encoder.webp({ quality: input.quality ?? 82 }).toBuffer();
  return encoder.png().toBuffer();
}
