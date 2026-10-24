import { MAX_UPLOAD_BYTES } from '../uploads';
import type { UploadReservation } from '../uploads';
import { uploadReservationSchema } from '../validation/uploads';

/** XHR is used only for byte progress; the signed URL is never logged or persisted. */
export function putUpload(
  blob: Blob,
  reservation: UploadReservation,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
): Promise<void> {
  const input = uploadReservationSchema.parse(reservation);
  if (!blob.size || blob.size > MAX_UPLOAD_BYTES || blob.type !== input.headers['Content-Type'])
    throw new TypeError('Invalid prepared upload');
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const finish = (error?: Error): void => {
      signal.removeEventListener('abort', abort);
      xhr.upload.onprogress = null;
      xhr.onload = null;
      xhr.onerror = null;
      xhr.onabort = null;
      xhr.ontimeout = null;
      if (error) reject(error);
      else resolve();
    };
    const abort = (): void => xhr.abort();
    xhr.open('PUT', input.url);
    xhr.withCredentials = false;
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    for (const [key, value] of Object.entries(input.headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event): void => {
      if (event.lengthComputable && event.total > 0 && !signal.aborted)
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = (): void =>
      xhr.status >= 200 && xhr.status < 300 ? finish() : finish(new Error('Upload failed'));
    xhr.onerror = (): void => finish(new Error('Upload failed'));
    xhr.ontimeout = (): void => finish(new Error('Upload timed out'));
    xhr.onabort = (): void => finish(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    try {
      xhr.send(blob);
    } catch {
      finish(new Error('Upload failed'));
    }
  });
}
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;
