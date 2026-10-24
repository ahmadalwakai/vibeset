import { z } from 'zod';
import {
  MAX_UPLOAD_BYTES,
  rasterContentType,
  uploadDimensionsReason,
  UploadPreparationError,
} from '../uploads';
import type { PreparedUpload, UploadKind } from '../uploads';

function isHeic(header: Uint8Array): boolean {
  if (String.fromCharCode(...header.subarray(4, 8)) !== 'ftyp') return false;
  const brands = String.fromCharCode(...header.subarray(8));
  return !/avif|avis/.test(brands) && /heic|heix|hevc|hevx|mif1|msf1/.test(brands);
}

export async function prepareUpload(
  file: File,
  options: { kind?: UploadKind; signal?: AbortSignal } = {},
): Promise<PreparedUpload> {
  const input = z.instanceof(File).parse(file),
    kind = z.enum(['wallpaper', 'avatar']).parse(options.kind ?? 'wallpaper');
  const signal = options.signal;
  signal?.throwIfAborted();
  if (!input.size || input.size > MAX_UPLOAD_BYTES) throw new UploadPreparationError('too_large');
  const header = new Uint8Array(await input.slice(0, 512).arrayBuffer());
  signal?.throwIfAborted();
  if (!rasterContentType(header) && !isHeic(header))
    throw new UploadPreparationError('unsupported');
  let bitmap: ImageBitmap | undefined,
    image: HTMLImageElement | undefined,
    url: string | undefined,
    canvas: HTMLCanvasElement | undefined;
  try {
    let width: number, height: number, source: CanvasImageSource;
    try {
      bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
      source = bitmap;
      width = bitmap.width;
      height = bitmap.height;
    } catch {
      signal?.throwIfAborted();
      // Some Safari decoders expose HEIC through <img> before createImageBitmap.
      image = new Image();
      url = URL.createObjectURL(input);
      image.src = url;
      await image.decode();
      source = image;
      width = image.naturalWidth;
      height = image.naturalHeight;
    }
    signal?.throwIfAborted();
    const reason = uploadDimensionsReason(width, height, kind);
    if (reason) throw new UploadPreparationError(reason);
    const scale = Math.min(1, 3000 / Math.max(width, height));
    const w = kind === 'avatar' ? 256 : Math.round(width * scale),
      h = kind === 'avatar' ? 256 : Math.round(height * scale);
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new UploadPreparationError('unsupported');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    if (kind === 'avatar') {
      const side = Math.min(width, height);
      ctx.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, w, h);
    } else ctx.drawImage(source, 0, 0, w, h);
    const encoded = await new Promise<Blob>((resolve, reject) =>
      canvas?.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new UploadPreparationError('unsupported'))),
        'image/jpeg',
        0.92,
      ),
    );
    signal?.throwIfAborted();
    if (!encoded.size || encoded.size > MAX_UPLOAD_BYTES)
      throw new UploadPreparationError('too_large');
    if (encoded.type !== 'image/jpeg') throw new UploadPreparationError('unsupported');
    return { blob: encoded, width: w, height: h };
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    if (error instanceof UploadPreparationError) throw error;
    throw new UploadPreparationError('unsupported');
  } finally {
    bitmap?.close();
    if (image) image.src = '';
    if (url) URL.revokeObjectURL(url);
    if (canvas) canvas.width = canvas.height = 0;
  }
}
