import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipFiles } from '../../../lib/client/zip';
import { MAX_ICON_EXPORT_BYTES } from '../../../lib/icon-export';

afterEach(() => vi.restoreAllMocks());
const image = (name = 'vibeset-night-phone.png'): File =>
  new File(['image bytes'], name, { type: 'image/png' });

describe('prepared ZIP exports', () => {
  it('produces a readable uncompressed ZIP with every exact filename and original payload', async () => {
    const first = image();
    const second = new File(['jpeg bytes'], 'vibeset-night-desktop.jpg', { type: 'image/jpeg' });
    const file = await zipFiles([first, second], { name: 'vibeset-night-icons.zip' });
    expect(file.name).toBe('vibeset-night-icons.zip');
    expect(file.type).toBe('application/zip');
    const data = new Uint8Array(await file.arrayBuffer());
    const entries = unzipSync(data);
    expect(Object.keys(entries)).toEqual([first.name, second.name]);
    expect(new TextDecoder().decode(entries[first.name])).toBe('image bytes');
    expect(new TextDecoder().decode(entries[second.name])).toBe('jpeg bytes');
    // The first local header's compression method is STORE (0), not deflate.
    expect(new DataView(data.buffer).getUint16(8, true)).toBe(0);
  });
  it.each([
    '../escape.png',
    '/absolute.png',
    'bad/name.png',
    'valid.png\n',
    'script.svg',
    'UPPER.png',
  ])('rejects unsafe or non-image entry %j', async (name) => {
    await expect(zipFiles([image(name)], { name: 'icons.zip' })).rejects.toThrow();
  });
  it('rejects duplicate entries, empty exports, invalid archives, empty bodies and oversized results', async () => {
    await expect(zipFiles([image(), image()], { name: 'icons.zip' })).rejects.toThrow('unique');
    await expect(zipFiles([], { name: 'icons.zip' })).rejects.toThrow();
    await expect(
      zipFiles([new File(['svg'], 'wrong.png', { type: 'image/jpeg' })], { name: 'icons.zip' }),
    ).rejects.toThrow();
    await expect(zipFiles([image()], { name: '../icons.zip' })).rejects.toThrow();
    await expect(
      zipFiles([new File([], 'empty.png', { type: 'image/png' })], { name: 'icons.zip' }),
    ).rejects.toThrow();
    class LargeFile extends File {
      override get size(): number {
        return MAX_ICON_EXPORT_BYTES + 1;
      }
    }
    await expect(
      zipFiles([new LargeFile(['x'], 'large.png', { type: 'image/png' })], { name: 'icons.zip' }),
    ).rejects.toThrow('budget');
  });
  it('stops before reading bytes when already cancelled', async () => {
    const file = image();
    const read = vi.spyOn(file, 'arrayBuffer');
    const controller = new AbortController();
    controller.abort();
    await expect(
      zipFiles([file], { name: 'icons.zip', signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).not.toHaveBeenCalled();
  });
  it('checks cancellation again after an asynchronous file read', async () => {
    let finish: (value: ArrayBuffer) => void = () => {};
    let started: () => void = () => {};
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const file = image();
    vi.spyOn(file, 'arrayBuffer').mockImplementation(() => {
      started();
      return new Promise<ArrayBuffer>((resolve) => {
        finish = resolve;
      });
    });
    const controller = new AbortController();
    const pending = zipFiles([file], { name: 'icons.zip', signal: controller.signal });
    await reading;
    controller.abort();
    finish(new ArrayBuffer(1));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
