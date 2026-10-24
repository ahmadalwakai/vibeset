import { z } from 'zod';
import type { WallpaperDownloadDTO } from '../dto';
import { env } from '../env.client';
import type { PlatformInfo } from './platform';

const MAX_WALLPAPER_BYTES = 32 * 1024 * 1024;
const wallpaperSchema = z.object({
  size: z.enum(['phone', 'tablet', 'desktop']),
  url: z.url().max(4096),
  w: z.number().int().positive().max(16_700_000),
  h: z.number().int().positive().max(16_700_000),
  bytes: z.number().int().positive().max(MAX_WALLPAPER_BYTES),
});
const slugSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .refine((value) => !/\s/.test(value));

export function chooseWallpaperSize(
  wallpapers: readonly WallpaperDownloadDTO[],
  platform: PlatformInfo,
): WallpaperDownloadDTO | undefined {
  const preferred = platform.isIPad
    ? 'tablet'
    : platform.platform === 'desktop'
      ? 'desktop'
      : 'phone';
  return (
    wallpapers.find((item) => item.size === preferred) ??
    wallpapers.find((item) => item.size === 'phone') ??
    wallpapers[0]
  );
}

/** Bound streamed CDN bytes before allocating a prepared file. */
export async function prepareWallpaperFile(
  slug: string,
  wallpaper: WallpaperDownloadDTO,
  signal: AbortSignal,
): Promise<File> {
  const validSlug = slugSchema.parse(slug);
  const input = wallpaperSchema.parse(wallpaper);
  if (input.w * input.h > 16_700_000) throw new RangeError('Wallpaper exceeds the pixel limit');
  const url = new URL(input.url);
  const cdn = new URL(env.NEXT_PUBLIC_CDN_URL);
  const basePath = `${cdn.pathname.replace(/\/+$/, '')}/`;
  if (
    url.origin !== cdn.origin ||
    !url.pathname.startsWith(basePath) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new TypeError('Wallpaper must use the configured CDN');
  signal.throwIfAborted();
  const response = await fetch(url.href, { mode: 'cors', credentials: 'omit', signal });
  if (!response.body) throw new Error('Wallpaper response is empty');
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  const abort = (): void => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    if (
      !response.ok ||
      response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'image/jpeg'
    )
      throw new Error('Wallpaper request did not return a JPEG image');
    const length = response.headers.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_WALLPAPER_BYTES))
      throw new RangeError('Wallpaper exceeds the download limit');
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_WALLPAPER_BYTES) throw new RangeError('Wallpaper exceeds the download limit');
      chunks.push(new Uint8Array(value));
    }
    const file = new File(chunks, `vibeset-${validSlug}-${input.size}-${input.w}x${input.h}.jpg`, {
      type: 'image/jpeg',
    });
    const signature = new Uint8Array(await file.slice(0, 3).arrayBuffer());
    signal.throwIfAborted();
    if (signature[0] !== 255 || signature[1] !== 216 || signature[2] !== 255)
      throw new TypeError('Wallpaper contains invalid JPEG data');
    return file;
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
