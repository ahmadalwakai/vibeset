import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { fetch as nativeFetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { z } from 'zod';
import { appSlugSchema } from '../../lib/validation/icon-export';
import { nativeIconPackSchema } from '../../lib/validation/native-icon-pack';
import type { NativeIconAsset, NativeIconPack } from '../../lib/validation/native-icon-pack';
import { parseNativePublicUrl } from './api';
import { NativeMediaError } from './media';

const MAX_BATCH_BYTES = 64 * 1024 * 1024;
const PNG = [137, 80, 78, 71, 13, 10, 26, 10];
let operation = 0;

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw signal.reason ?? Object.assign(new Error('Operation aborted'), { name: 'AbortError' });
}

function beforeAbort<T>(start: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = (): void => {
      signal.removeEventListener('abort', aborted);
      reject(signal.reason);
    };
    if (signal.aborted) return aborted();
    signal.addEventListener('abort', aborted, { once: true });
    void Promise.resolve()
      .then(() => {
        assertActive(signal);
        return start();
      })
      .then(
        (value) => {
          signal.removeEventListener('abort', aborted);
          if (signal.aborted) aborted();
          else resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', aborted);
          reject(error);
        },
      );
  });
}

function selection(
  pack: NativeIconPack,
  slugs: readonly string[],
): { pack: NativeIconPack; icons: NativeIconAsset[] } {
  const parsed = nativeIconPackSchema.safeParse(pack);
  const chosen = z.array(appSlugSchema).max(125).safeParse(slugs);
  if (!parsed.success || !chosen.success || new Set(chosen.data).size !== chosen.data.length)
    throw new NativeMediaError('INVALID_ASSET');
  let cdn: URL;
  try {
    cdn = parseNativePublicUrl(process.env.EXPO_PUBLIC_CDN_URL, true);
  } catch {
    throw new NativeMediaError('CONFIG');
  }
  const basePath = `${cdn.pathname.replace(/\/+$/, '')}/`;
  for (const icon of parsed.data.icons) {
    const url = new URL(icon.url);
    const path = `${basePath}theme-packs/v1/${parsed.data.specHash}/${icon.appSlug}-${icon.sha256}.png`;
    if (url.origin !== cdn.origin || url.pathname !== path)
      throw new NativeMediaError('INVALID_ASSET');
  }
  const icons = chosen.data.map((slug) => parsed.data.icons.find((icon) => icon.appSlug === slug));
  if (
    icons.some((icon) => !icon) ||
    icons.reduce((sum, icon) => sum + (icon?.bytes ?? 0), 0) > MAX_BATCH_BYTES
  )
    throw new NativeMediaError('INVALID_ASSET');
  return { pack: parsed.data, icons: icons.filter((icon): icon is NativeIconAsset => !!icon) };
}

function validatePng(bytes: Uint8Array): void {
  if (bytes.length < 33 || PNG.some((byte, index) => bytes[index] !== byte))
    throw new NativeMediaError('INVALID_ASSET');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(8) !== 13 ||
    view.getUint32(12) !== 0x49484452 ||
    view.getUint32(16) !== 512 ||
    view.getUint32(20) !== 512 ||
    bytes[24] !== 8 ||
    ![0, 2, 3, 4, 6].includes(bytes[25] ?? -1) ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    (bytes[28] !== 0 && bytes[28] !== 1)
  )
    throw new NativeMediaError('INVALID_ASSET');
}

async function withIconFile(
  slug: string,
  icon: NativeIconAsset,
  consume: (file: File) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  assertActive(signal);
  const controller = new AbortController();
  const abort = (): void => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new NativeMediaError('NETWORK')), 30_000);
  let directory: Directory | undefined;
  let created = false;
  let response: Response | undefined;
  try {
    response = await beforeAbort(async () => {
      const result = await nativeFetch(icon.url, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
        headers: { Accept: 'image/png' },
      });
      if (controller.signal.aborted) {
        void result.body?.cancel().catch(() => {});
        assertActive(controller.signal);
      }
      return result;
    }, controller.signal);
    if (!response.ok) throw new NativeMediaError('NETWORK');
    if (
      response.redirected ||
      (response.url && response.url !== icon.url) ||
      !response.body ||
      response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'image/png'
    )
      throw new NativeMediaError('INVALID_ASSET');
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) !== icon.bytes))
      throw new NativeMediaError('INVALID_ASSET');
    directory = new Directory(Paths.cache, `vibeset-icons-${Date.now()}-${++operation}`);
    directory.create();
    created = true;
    const file = new File(directory, `vibeset-${slug}-${icon.appSlug}.png`);
    file.create();
    const reader = response.body.getReader();
    const writer = file.writableStream().getWriter();
    let closed = false;
    let count = 0;
    const header = new Uint8Array(33);
    try {
      while (true) {
        const { done, value } = await beforeAbort(() => reader.read(), controller.signal);
        if (done) break;
        if (count + value.byteLength > icon.bytes) throw new NativeMediaError('INVALID_ASSET');
        if (count < header.length) header.set(value.subarray(0, header.length - count), count);
        count += value.byteLength;
        if (count >= header.length) validatePng(header);
        await beforeAbort(() => writer.write(value), controller.signal);
      }
      if (count !== icon.bytes || count < header.length)
        throw new NativeMediaError('INVALID_ASSET');
      validatePng(header);
      await beforeAbort(() => writer.close(), controller.signal);
      closed = true;
    } finally {
      void reader.cancel().catch(() => {});
      reader.releaseLock();
      if (!closed) void writer.abort().catch(() => {});
      writer.releaseLock();
    }
    const bytes = await beforeAbort(() => file.bytes(), controller.signal);
    if (bytes.byteLength !== icon.bytes) throw new NativeMediaError('INVALID_ASSET');
    const hash = new Uint8Array(
      await beforeAbort(() => digest(CryptoDigestAlgorithm.SHA256, bytes), controller.signal),
    );
    if (Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('') !== icon.sha256)
      throw new NativeMediaError('INVALID_ASSET');
    clearTimeout(timeout);
    assertActive(signal);
    // OS save/share cannot be cancelled once presented. Await completion before recording or cleanup.
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
    if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
    try {
      if (created) directory?.delete();
    } catch {
      /* OS cache eviction handles an open temporary copy. */
    }
  }
}

/** Each callback follows a confirmed Photos save and is persisted before the next icon starts. */
export async function saveThemeIcons(
  pack: NativeIconPack,
  slugs: readonly string[],
  onSaved: (appSlug: string) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  assertActive(signal);
  const input = selection(pack, slugs);
  if (!input.icons.length) return;
  let granted: boolean;
  try {
    granted = (await requestPermissionsAsync(true, ['photo'])).granted;
  } catch {
    assertActive(signal);
    throw new NativeMediaError('UNAVAILABLE');
  }
  assertActive(signal);
  if (!granted) throw new NativeMediaError('PERMISSION_DENIED');
  for (const icon of input.icons) {
    assertActive(signal);
    await withIconFile(
      input.pack.slug,
      icon,
      async (file) => {
        try {
          await Asset.create(file.uri);
        } catch {
          throw new NativeMediaError('SAVE_FAILED');
        }
        // Cancellation during a successful OS save must not discard its durable resume progress.
        await onSaved(icon.appSlug);
      },
      signal,
    );
  }
}

/** Completion means the share sheet closed; iOS does not confirm delivery or Shortcut installation. */
export async function shareThemeIcon(
  pack: NativeIconPack,
  appSlug: string,
  signal?: AbortSignal,
): Promise<void> {
  assertActive(signal);
  const input = selection(pack, [appSlug]);
  const icon = input.icons[0];
  if (!icon) throw new NativeMediaError('INVALID_ASSET');
  let available: boolean;
  try {
    available = await isAvailableAsync();
  } catch {
    assertActive(signal);
    throw new NativeMediaError('UNAVAILABLE');
  }
  assertActive(signal);
  if (!available) throw new NativeMediaError('UNAVAILABLE');
  await withIconFile(
    input.pack.slug,
    icon,
    async (file) => {
      try {
        await shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png' });
      } catch {
        throw new NativeMediaError('SHARE_FAILED');
      }
    },
    signal,
  );
}
