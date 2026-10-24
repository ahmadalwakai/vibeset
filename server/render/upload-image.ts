import 'server-only';

import sharp from 'sharp';
import type { Sharp } from 'sharp';
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_PIXELS,
  rasterContentType,
  uploadDimensionsReason,
  UploadPreparationError,
} from '../../lib/uploads';
import type { UploadContentType, UploadKind } from '../../lib/uploads';
import { extractPhotoPalette } from './palette-extract';

export interface NormalizedUpload {
  full: Uint8Array;
  preview: Uint8Array;
  width: number;
  height: number;
  palette: string[];
}
export async function normalizeUpload(
  bytes: Uint8Array,
  contentType: UploadContentType,
  kind: UploadKind,
): Promise<NormalizedUpload> {
  if (!bytes.byteLength || bytes.byteLength > MAX_UPLOAD_BYTES)
    throw new UploadPreparationError('too_large');
  if (rasterContentType(bytes) !== contentType) throw new UploadPreparationError('unsupported');
  let image: Sharp;
  try {
    image = sharp(bytes, {
      limitInputPixels: MAX_UPLOAD_PIXELS,
      failOn: 'warning',
      animated: true,
    });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1)
      throw new UploadPreparationError('unsupported');
    const rotated = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
    const width = (rotated ? metadata.height : metadata.width) ?? 0,
      height = (rotated ? metadata.width : metadata.height) ?? 0;
    const reason = uploadDimensionsReason(width, height, kind);
    if (reason) throw new UploadPreparationError(reason);
  } catch (error) {
    if (error instanceof UploadPreparationError) throw error;
    if (error instanceof Error && /pixel limit/i.test(error.message))
      throw new UploadPreparationError('too_large');
    throw new UploadPreparationError('unsupported');
  }
  try {
    const pipeline = image.rotate().flatten({ background: '#ffffff' }).toColourspace('srgb');
    if (kind === 'avatar') {
      const output = await pipeline
        .resize(256, 256, { fit: 'cover', position: 'centre' })
        .webp({ quality: 85 })
        .toBuffer();
      return { full: output, preview: output, width: 256, height: 256, palette: [] };
    }
    const output = await pipeline
      .resize({ height: 2868, withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    const preview = await sharp(output.data)
      .resize({ height: 780, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    if (output.data.byteLength > MAX_UPLOAD_BYTES) throw new UploadPreparationError('too_large');
    return {
      full: output.data,
      preview,
      width: output.info.width,
      height: output.info.height,
      palette: await extractPhotoPalette(output.data),
    };
  } catch (error) {
    if (error instanceof UploadPreparationError) throw error;
    throw new UploadPreparationError('unsupported');
  }
}
