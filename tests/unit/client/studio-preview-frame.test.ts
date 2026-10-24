import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareStudioPreviewFrame } from '@/lib/client/studio-preview-frame';
import type { StudioWallpaperPreview } from '@/lib/client/studio-preview';

const dark: StudioWallpaperPreview = {
  src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
  noise: null,
  foreground: '#fafafa',
};
const light: StudioWallpaperPreview = {
  ...dark,
  src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="2"/>',
  foreground: '#111111',
};

class PendingImage {
  static readonly instances: PendingImage[] = [];
  readonly decoded = Promise.withResolvers<void>();
  decoding = '';
  src = '';
  decode = vi.fn((): Promise<void> => this.decoded.promise);

  constructor() {
    PendingImage.instances.push(this);
  }
}

async function pendingImage(index = 0): Promise<PendingImage> {
  await vi.waitFor(() => expect(PendingImage.instances.length).toBeGreaterThan(index));
  const image = PendingImage.instances[index];
  if (!image) throw new Error('Missing pending image');
  return image;
}

beforeEach(() => {
  PendingImage.instances.length = 0;
  vi.stubGlobal('Image', PendingImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Studio preview frame readiness', () => {
  it('does not expose a generated foreground until the matching image is decoded', async () => {
    const prepared = Promise.withResolvers<StudioWallpaperPreview>();
    let ready = false;
    const result = prepareStudioPreviewFrame(() => prepared.promise, new AbortController().signal);
    void result.then(() => {
      ready = true;
    });
    await Promise.resolve();
    expect(PendingImage.instances).toHaveLength(0);
    expect(ready).toBe(false);

    prepared.resolve(dark);
    const image = await pendingImage();
    expect(image.src).toBe(dark.src);
    expect(image.decoding).toBe('async');
    expect(ready).toBe(false);
    image.decoded.resolve();

    expect(await result).toBe(dark);
    expect(ready).toBe(true);
    expect(image.src).toBe('');
  });

  it('does not prepare or decode an already abandoned frame', async () => {
    const controller = new AbortController();
    controller.abort();
    const prepare = vi.fn(async () => dark);
    await expect(prepareStudioPreviewFrame(prepare, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(PendingImage.instances).toHaveLength(0);
  });

  it('ignores preparation completed after an edit or unmount aborts it', async () => {
    const controller = new AbortController();
    const prepared = Promise.withResolvers<StudioWallpaperPreview>();
    const result = prepareStudioPreviewFrame(() => prepared.promise, controller.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    prepared.resolve(dark);
    await rejected;
    expect(PendingImage.instances).toHaveLength(0);
  });

  it('abandons an unresolved decode promptly and releases its source and abort listener', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const result = prepareStudioPreviewFrame(async () => dark, controller.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    const image = await pendingImage();
    controller.abort();
    await rejected;
    expect(image.src).toBe('');
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('leaves a failed decode retryable without returning its foreground', async () => {
    const result = prepareStudioPreviewFrame(async () => dark, new AbortController().signal);
    const rejected = expect(result).rejects.toThrow('Cannot decode');
    const failed = await pendingImage();
    failed.decoded.reject(new Error('Cannot decode'));
    await rejected;
    expect(failed.src).toBe('');

    const retried = prepareStudioPreviewFrame(async () => light, new AbortController().signal);
    const next = await pendingImage(1);
    next.decoded.resolve();
    expect(await retried).toBe(light);
    expect(next.src).toBe('');
  });

  it('cannot replace a newer decoded frame with an older decode that finishes late', async () => {
    const controller = new AbortController();
    const old = prepareStudioPreviewFrame(async () => dark, controller.signal);
    const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    const previous = await pendingImage();
    controller.abort();
    await rejected;

    const current = prepareStudioPreviewFrame(async () => light, new AbortController().signal);
    const next = await pendingImage(1);
    next.decoded.resolve();
    expect(await current).toBe(light);
    previous.decoded.resolve();
    expect(previous.src).toBe('');
  });

  it('cleans up after a synchronous decoder failure', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    vi.stubGlobal(
      'Image',
      class extends PendingImage {
        override decode = vi.fn((): Promise<void> => {
          throw new Error('Synchronous decode');
        });
      },
    );
    const result = prepareStudioPreviewFrame(async () => dark, controller.signal);
    const rejected = expect(result).rejects.toThrow('Synchronous decode');
    await rejected;
    expect(PendingImage.instances[0]?.src).toBe('');
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('does not create an image when preparation fails', async () => {
    await expect(
      prepareStudioPreviewFrame(async () => {
        throw new Error('Unavailable');
      }, new AbortController().signal),
    ).rejects.toThrow('Unavailable');
    expect(PendingImage.instances).toHaveLength(0);
  });
});
