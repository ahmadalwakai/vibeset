import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareUpload } from '../../../lib/client/prepare-upload';
import { MAX_UPLOAD_BYTES } from '../../../lib/uploads';

const bitmap = { width: 2160, height: 3840, close: vi.fn() };
const ctx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
const canvas = {
  width: 0,
  height: 0,
  getContext: vi.fn(() => ctx),
  toBlob: vi.fn((callback: (blob: Blob | null) => void) =>
    callback(new Blob([new Uint8Array([255, 216, 255, 1])], { type: 'image/jpeg' })),
  ),
};
const file = (): File =>
  new File([new Uint8Array([255, 216, 255, 1])], 'private-gps.jpg', { type: 'image/jpeg' });
beforeEach(() => {
  vi.clearAllMocks();
  bitmap.width = 2160;
  bitmap.height = 3840;
  canvas.toBlob.mockImplementation((callback) =>
    callback(new Blob([new Uint8Array([255, 216, 255, 1])], { type: 'image/jpeg' })),
  );
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('client photo preparation and cleanup', () => {
  it('uses native image fallback for supported HEIC decoders and revokes its local URL', async () => {
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('Bitmap format unsupported'));
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        naturalWidth = 1080;
        naturalHeight = 1920;
        async decode(): Promise<void> {}
      },
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-photo');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const header = new Uint8Array(20);
    header.set(new TextEncoder().encode('ftypheic'), 4);
    const result = await prepareUpload(new File([header], 'photo.heic', { type: 'image/heic' }));
    expect(result.blob.type).toBe('image/jpeg');
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:local-photo');
  });
  it('normalizes portrait pixels to longest3000atJPEGq.92 then releases bitmap/canvas', async () => {
    const result = await prepareUpload(file());
    expect([result.width, result.height]).toEqual([1688, 3000]);
    expect(result.blob.type).toBe('image/jpeg');
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1688, 3000);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.92);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });
  it('center-crops avatars at256rather than applying portrait validation', async () => {
    bitmap.width = 600;
    bitmap.height = 300;
    const result = await prepareUpload(file(), { kind: 'avatar' });
    expect([result.width, result.height]).toEqual([256, 256]);
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 150, 0, 300, 300, 0, 0, 256, 256);
  });
  it('rejects spoofed SVG, corrupt headers, and excess raw bytes before decode', async () => {
    await expect(
      prepareUpload(new File(['<svg/>'], 'fake.jpg', { type: 'image/jpeg' })),
    ).rejects.toMatchObject({ reason: 'unsupported' });
    const large = file();
    Object.defineProperty(large, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    await expect(prepareUpload(large)).rejects.toMatchObject({ reason: 'too_large' });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
  it.each([
    [1000, 1920, 'too_small'],
    [1800, 1920, 'bad_aspect'],
    [8001, 8000, 'too_large'],
  ] as const)(
    'rejects oriented dimensions%s×%swith%sand closes decode',
    (width, height, reason) => {
      bitmap.width = width;
      bitmap.height = height;
      return expect(prepareUpload(file()))
        .rejects.toMatchObject({ reason })
        .then(() => expect(bitmap.close).toHaveBeenCalledOnce());
    },
  );
  it('closes a late bitmap when cancelled during nonabortable native decode', async () => {
    let finish: (value: typeof bitmap) => void = () => {};
    vi.mocked(createImageBitmap).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController(),
      pending = prepareUpload(file(), { signal: controller.signal });
    while (!vi.mocked(createImageBitmap).mock.calls.length) await Promise.resolve();
    controller.abort();
    finish(bitmap);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
  it('releases all resources after failed canvas encoding', async () => {
    canvas.toBlob.mockImplementationOnce((callback) => callback(null));
    await expect(prepareUpload(file())).rejects.toMatchObject({ reason: 'unsupported' });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });
});
