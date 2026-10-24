import { fetch as nativeFetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import type { ThemeDetailDTO, WallpaperDownloadDTO } from '../../lib/dto';
import { themeDetailSchema } from '../../lib/validation/theme-detail';
import { MAX_WALLPAPER_BYTES, MAX_WALLPAPER_PIXELS } from '../../lib/wallpaper-export';
import { NativeServiceError, parseNativePublicUrl } from './api';

export type NativeMediaErrorCode =
  | 'CONFIG'
  | 'NO_WALLPAPER'
  | 'NETWORK'
  | 'INVALID_ASSET'
  | 'PERMISSION_DENIED'
  | 'UNAVAILABLE'
  | 'SAVE_FAILED'
  | 'SHARE_FAILED';

export class NativeMediaError extends Error {
  constructor(readonly code: NativeMediaErrorCode) {
    super(`Native wallpaper operation failed: ${code}`);
    this.name = 'NativeMediaError';
  }
}

let operation = 0;

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw signal.reason ?? Object.assign(new Error('Operation aborted'), { name: 'AbortError' });
}

function phoneWallpaper(theme: ThemeDetailDTO): { slug: string; asset: WallpaperDownloadDTO } {
  const parsed = themeDetailSchema.safeParse(theme);
  if (!parsed.success) throw new NativeMediaError('INVALID_ASSET');
  const asset = parsed.data.wallpapers.find(({ size }) => size === 'phone');
  if (!asset) throw new NativeMediaError('NO_WALLPAPER');
  let cdn: URL;
  try {
    cdn = parseNativePublicUrl(process.env.EXPO_PUBLIC_CDN_URL, true);
  } catch (error) {
    if (error instanceof NativeServiceError) throw new NativeMediaError('CONFIG');
    throw error;
  }
  const url = new URL(asset.url);
  const basePath = `${cdn.pathname.replace(/\/+$/, '')}/`;
  if (
    url.origin !== cdn.origin ||
    !url.pathname.startsWith(basePath) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    asset.bytes > MAX_WALLPAPER_BYTES ||
    asset.w * asset.h > MAX_WALLPAPER_PIXELS
  )
    throw new NativeMediaError('INVALID_ASSET');
  return { slug: parsed.data.slug, asset };
}

async function withWallpaperFile(
  input: { slug: string; asset: WallpaperDownloadDTO },
  consume: (file: File) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  assertActive(signal);
  const controller = new AbortController();
  const abort = (): void => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let directory: Directory | undefined;
  let directoryCreated = false;
  try {
    const response = await nativeFetch(input.asset.url, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'image/jpeg' },
    });
    assertActive(signal);
    if (!response.ok) throw new NativeMediaError('NETWORK');
    if (
      response.redirected ||
      (response.url && response.url !== input.asset.url) ||
      response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'image/jpeg' ||
      !response.body
    )
      throw new NativeMediaError('INVALID_ASSET');
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) !== input.asset.bytes))
      throw new NativeMediaError('INVALID_ASSET');

    // A private per-operation directory prevents overlapping saves from sharing a temporary file.
    directory = new Directory(Paths.cache, `vibeset-wallpaper-${Date.now()}-${++operation}`);
    directory.create();
    directoryCreated = true;
    const file = new File(directory, `vibeset-${input.slug}-phone.jpg`);
    file.create();
    const reader = response.body.getReader();
    const writer = file.writableStream().getWriter();
    let closed = false;
    let bytes = 0;
    const signature: number[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        assertActive(controller.signal);
        if (done) break;
        bytes += value.byteLength;
        if (bytes > input.asset.bytes || bytes > MAX_WALLPAPER_BYTES)
          throw new NativeMediaError('INVALID_ASSET');
        for (const byte of value.subarray(0, Math.max(0, 3 - signature.length)))
          signature.push(byte);
        if (
          signature.length === 3 &&
          signature.some((byte, index) => byte !== [255, 216, 255][index])
        )
          throw new NativeMediaError('INVALID_ASSET');
        await writer.write(value);
      }
      if (bytes !== input.asset.bytes || signature.length !== 3)
        throw new NativeMediaError('INVALID_ASSET');
      await writer.close();
      closed = true;
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
      if (!closed) await writer.abort().catch(() => {});
      writer.releaseLock();
    }
    clearTimeout(timeout);
    assertActive(signal);
    await consume(file);
    assertActive(signal);
  } catch (error) {
    assertActive(signal);
    if (error instanceof NativeMediaError) throw error;
    throw new NativeMediaError('NETWORK');
  } finally {
    clearTimeout(timeout);
    controller.abort();
    signal?.removeEventListener('abort', abort);
    try {
      if (directoryCreated) directory?.delete();
    } catch {
      // If the OS has the file open, its cache eviction remains responsible for this temporary copy.
    }
  }
}

export async function saveWallpaper(theme: ThemeDetailDTO, signal?: AbortSignal): Promise<void> {
  assertActive(signal);
  const input = phoneWallpaper(theme);
  let granted: boolean;
  try {
    granted = (await requestPermissionsAsync(true, ['photo'])).granted;
  } catch {
    assertActive(signal);
    throw new NativeMediaError('UNAVAILABLE');
  }
  assertActive(signal);
  if (!granted) throw new NativeMediaError('PERMISSION_DENIED');
  await withWallpaperFile(
    input,
    async (file) => {
      try {
        await Asset.create(file.uri);
      } catch {
        throw new NativeMediaError('SAVE_FAILED');
      }
    },
    signal,
  );
}

/** Completion means the native sheet closed; the platform does not confirm delivery. */
export async function shareWallpaper(theme: ThemeDetailDTO, signal?: AbortSignal): Promise<void> {
  assertActive(signal);
  const input = phoneWallpaper(theme);
  let available: boolean;
  try {
    available = await isAvailableAsync();
  } catch {
    assertActive(signal);
    throw new NativeMediaError('UNAVAILABLE');
  }
  assertActive(signal);
  if (!available) throw new NativeMediaError('UNAVAILABLE');
  await withWallpaperFile(
    input,
    async (file) => {
      try {
        await shareAsync(file.uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg' });
      } catch {
        throw new NativeMediaError('SHARE_FAILED');
      }
    },
    signal,
  );
}
