import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { putUpload } from '../../../lib/client/upload';

class FakeXHR {
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  timeout = 0;
  status = 200;
  withCredentials = true;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  abort = vi.fn(() => this.onabort?.());
}
let xhr: FakeXHR;
const reservation = {
  uploadId: '11111111-1111-4111-8111-111111111111',
  url: 'https://signed.example.invalid/object?signature=test',
  headers: { 'Content-Type': 'image/jpeg' as const },
};
const blob = (): Blob => new Blob(['jpeg'], { type: 'image/jpeg' });
beforeEach(() => {
  xhr = new FakeXHR();
  vi.stubGlobal(
    'XMLHttpRequest',
    class {
      constructor() {
        return xhr;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
describe('direct signed PUT lifecycle', () => {
  it('passes only prescribed headers, reportsboundedprogress, and cleans handlers', async () => {
    const progress = vi.fn(),
      promise = putUpload(blob(), reservation, new AbortController().signal, progress);
    expect(xhr.open).toHaveBeenCalledWith('PUT', reservation.url);
    expect(xhr.withCredentials).toBe(false);
    expect(xhr.setRequestHeader).toHaveBeenCalledExactlyOnceWith('Content-Type', 'image/jpeg');
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
    expect(progress).toHaveBeenCalledWith(50);
    xhr.onload?.();
    await promise;
    expect(xhr.onload).toBeNull();
    expect(xhr.upload.onprogress).toBeNull();
  });
  it('aborts native PUT and rejects asAbortErrorwithout keeping callbacks alive', async () => {
    const controller = new AbortController(),
      promise = putUpload(blob(), reservation, controller.signal, vi.fn());
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(xhr.abort).toHaveBeenCalledOnce();
    expect(xhr.onload).toBeNull();
  });
  it.each(['error', 'timeout', 'status'] as const)(
    'rejects%swithout leaking a signedURL',
    (kind) => {
      const promise = putUpload(blob(), reservation, new AbortController().signal, vi.fn());
      if (kind === 'error') xhr.onerror?.();
      else if (kind === 'timeout') xhr.ontimeout?.();
      else {
        xhr.status = 403;
        xhr.onload?.();
      }
      return expect(promise).rejects.toThrow(/^Upload (failed|timed out)$/);
    },
  );
  it('validates MIME,URL and pre-aborted input before sending bytes', () => {
    expect(() =>
      putUpload(
        new Blob(['svg'], { type: 'image/svg+xml' }),
        reservation,
        new AbortController().signal,
        vi.fn(),
      ),
    ).toThrow();
    const controller = new AbortController();
    controller.abort();
    expect(() => putUpload(blob(), reservation, controller.signal, vi.fn())).toThrow();
    expect(xhr.send).not.toHaveBeenCalled();
  });
});
