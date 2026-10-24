import type { StudioWallpaperPreview } from './studio-preview';

/** A frame becomes usable only when its matching image is decoded, not merely generated. */
export async function prepareStudioPreviewFrame(
  prepare: () => Promise<StudioWallpaperPreview>,
  signal: AbortSignal,
): Promise<StudioWallpaperPreview> {
  signal.throwIfAborted();
  const frame = await prepare();
  signal.throwIfAborted();
  const image = new Image();
  let aborted: (() => void) | undefined;
  try {
    image.decoding = 'async';
    image.src = frame.src;
    await new Promise<void>((resolve, reject) => {
      aborted = (): void => reject(signal.reason);
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted();
      else void image.decode().then(resolve, reject);
    });
    signal.throwIfAborted();
    return frame;
  } finally {
    if (aborted) signal.removeEventListener('abort', aborted);
    image.src = '';
  }
}
