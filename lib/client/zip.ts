import { z } from 'zod';
import { MAX_ICON_EXPORT_BYTES, MAX_ICON_EXPORT_FILES } from '../icon-export';
import type { AsyncZippable, AsyncTerminable } from 'fflate';

const entryNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9][a-z0-9-]*\.(png|jpg)$/)
  .refine((value) => !/\s/.test(value));
const archiveNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9][a-z0-9-]*\.zip$/)
  .refine((value) => !/\s/.test(value));

export async function zipFiles(
  files: readonly File[],
  {
    name,
    signal,
  }: {
    name: string;
    signal?: AbortSignal;
  },
): Promise<File> {
  signal?.throwIfAborted();
  const archiveName = archiveNameSchema.parse(name);
  const prepared = z.array(z.instanceof(File)).min(1).max(MAX_ICON_EXPORT_FILES).parse(files);
  const seen = new Set<string>();
  let total = 0;
  for (const file of prepared) {
    entryNameSchema.parse(file.name);
    total += file.size;
    if (
      !file.size ||
      file.type !== (file.name.endsWith('.png') ? 'image/png' : 'image/jpeg') ||
      seen.has(file.name) ||
      total > MAX_ICON_EXPORT_BYTES
    )
      throw new TypeError('ZIP entries must be unique images within the export byte budget');
    seen.add(file.name);
  }
  const { zip } = await import('fflate');
  const entries: AsyncZippable = {};
  for (const file of prepared) {
    signal?.throwIfAborted();
    entries[file.name] = new Uint8Array(await file.arrayBuffer());
    signal?.throwIfAborted();
  }
  return new Promise<File>((resolve, reject) => {
    let settled = false;
    let terminate: AsyncTerminable | undefined;
    const abort = (): void => {
      if (settled) return;
      settled = true;
      terminate?.();
      signal?.removeEventListener('abort', abort);
      reject(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      terminate = zip(entries, { level: 0 }, (error, data) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', abort);
        if (error) reject(new Error('ZIP preparation failed'));
        else {
          try {
            resolve(new File([data], archiveName, { type: 'application/zip' }));
          } catch {
            reject(new Error('ZIP preparation failed'));
          }
        }
      });
    } catch {
      if (!settled) {
        settled = true;
        signal?.removeEventListener('abort', abort);
        terminate?.();
        reject(new Error('ZIP preparation failed'));
      }
    }
  });
}
