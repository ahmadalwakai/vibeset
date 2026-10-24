export const MAX_UPLOAD_BYTES = 15_000_000;
export const MAX_UPLOAD_PIXELS = 64_000_000;
export const UPLOAD_PRESIGN_SECONDS = 300;
export const UPLOAD_PENDING_MS = 24 * 60 * 60 * 1000;
export const UPLOAD_INVALID_REASONS = [
  'too_small',
  'bad_aspect',
  'too_large',
  'unsupported',
  'expired',
] as const;
export type UploadInvalidReason = (typeof UPLOAD_INVALID_REASONS)[number];
export type UploadKind = 'wallpaper' | 'avatar';
export type UploadContentType = 'image/jpeg' | 'image/png' | 'image/webp';
export interface UploadReservation {
  uploadId: string;
  url: string;
  headers: { 'Content-Type': UploadContentType };
}
export interface UploadedAsset {
  uploadId: string;
  assetKey: string;
  previewUrl: string;
  width: number;
  height: number;
}
export interface FinalizedWallpaperUpload extends UploadedAsset {
  palette: string[];
}
export interface PreparedUpload {
  blob: Blob;
  width: number;
  height: number;
}
export class UploadPreparationError extends Error {
  override readonly name = 'UploadPreparationError';
  constructor(public readonly reason: UploadInvalidReason) {
    super(reason);
  }
}

/** Check magic bytes before any image decoder sees input, regardless of claimed MIME. */
export function rasterContentType(bytes: Uint8Array): UploadContentType | null {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value))
    return 'image/png';
  if (
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

export function uploadDimensionsReason(
  width: number,
  height: number,
  kind: UploadKind,
): UploadInvalidReason | null {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0)
    return 'unsupported';
  if (width * height > MAX_UPLOAD_PIXELS) return 'too_large';
  if (kind === 'avatar') return width < 256 || height < 256 ? 'too_small' : null;
  if (width < 1080 || height < 1920) return 'too_small';
  return width / height < 0.4 || width / height > 0.7 ? 'bad_aspect' : null;
}
