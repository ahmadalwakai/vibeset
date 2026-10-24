import { z } from 'zod';
import { canShareFiles, isIOS } from './platform';
import type { Platform } from './platform';

export const IOS_SHARE_BATCH = 20;

export function chooseSaveStrategy(platform: Platform, canShare: boolean): 'share' | 'download' {
  return platform !== 'desktop' && canShare ? 'share' : 'download';
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isSafeInteger(size) || size < 1) throw new RangeError('Chunk size must be positive');
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size)
    chunks.push(items.slice(start, start + size));
  return chunks;
}

function errorNamed(error: unknown, name: string): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === name;
}

function validateFiles(files: File[]): File[] {
  return z
    .array(z.instanceof(File).refine((file) => file.size > 0, 'File must not be empty'))
    .min(1)
    .max(100)
    .parse(files);
}

export function downloadFile(file: File): void {
  validateFiles([file]);
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(file);
  try {
    anchor.href = url;
    anchor.download = file.name;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

/** Invoke directly from a tap after files are prepared; never fetch before sharing. */
export async function shareFiles(
  files: File[],
): Promise<'saved' | 'cancelled' | 'activation-required'> {
  const prepared = validateFiles(files);
  if (isIOS() && prepared.length > IOS_SHARE_BATCH)
    throw new RangeError('Split iOS shares into batches of at most 20 files');
  if (canShareFiles(prepared)) {
    try {
      await navigator.share({ files: prepared });
      return 'saved';
    } catch (error) {
      if (errorNamed(error, 'AbortError')) return 'cancelled';
      if (errorNamed(error, 'NotAllowedError')) return 'activation-required';
      if (prepared.length > 1)
        throw new Error('File sharing failed; offer a prepared ZIP download');
    }
  }
  const file = prepared[0];
  if (prepared.length !== 1 || !file)
    throw new Error('Multiple files require sharing support or a prepared ZIP download');
  downloadFile(file);
  return 'saved';
}

const urlShareSchema = z.object({
  title: z.string().trim().min(1).max(300),
  url: z
    .url()
    .max(4096)
    .refine((value) => {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    }),
});

export async function copyUrl(url: string): Promise<void> {
  const prepared = urlShareSchema.shape.url.parse(url);
  await navigator.clipboard.writeText(prepared);
}

export async function shareUrl(input: {
  title: string;
  url: string;
}): Promise<'shared' | 'copied' | 'cancelled' | 'activation-required'> {
  const prepared = urlShareSchema.parse(input);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(prepared);
      return 'shared';
    } catch (error) {
      if (errorNamed(error, 'AbortError')) return 'cancelled';
      if (errorNamed(error, 'NotAllowedError')) return 'activation-required';
    }
  }
  await copyUrl(prepared.url);
  return 'copied';
}
