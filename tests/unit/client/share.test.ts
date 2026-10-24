import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IOS_SHARE_BATCH,
  chooseSaveStrategy,
  chunk,
  copyUrl,
  downloadFile,
  shareFiles,
  shareUrl,
} from '../../../lib/client/share';

const anchor = { href: '', download: '', rel: '', click: vi.fn(), remove: vi.fn() };
const share = vi.fn();
const clipboard = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  share.mockReset().mockResolvedValue(undefined);
  clipboard.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', {
    userAgent: 'iPhone',
    platform: 'iPhone',
    maxTouchPoints: 1,
    share,
    canShare: vi.fn(() => true),
    clipboard: { writeText: clipboard },
  });
  vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { append: vi.fn() } });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:prepared');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const file = (): File =>
  new File(['image'], 'vibeset-night-phone-1320x2868.jpg', { type: 'image/jpeg' });

describe('save strategy and batching', () => {
  it.each([
    ['ios', true, 'share'],
    ['android', true, 'share'],
    ['desktop', true, 'download'],
    ['ios', false, 'download'],
    ['android', false, 'download'],
    ['desktop', false, 'download'],
  ] as const)('chooses %s / capability %s → %s', (platform, capability, result) => {
    expect(chooseSaveStrategy(platform, capability)).toBe(result);
  });
  it('chunks without mutating or dropping the final iOS batch', () => {
    const files = Array.from({ length: 24 }, (_, index) => index);
    expect(IOS_SHARE_BATCH).toBe(20);
    expect(chunk(files, IOS_SHARE_BATCH)).toEqual([files.slice(0, 20), files.slice(20)]);
    expect(files).toHaveLength(24);
    expect(chunk([], 20)).toEqual([]);
  });
  it.each([0, -1, 0.5, NaN, Infinity])('rejects unsafe chunk size %s', (size) => {
    expect(() => chunk([1], size)).toThrow(RangeError);
  });
});

describe('file sharing', () => {
  it('calls the native share synchronously before yielding and reports success', async () => {
    const prepared = file();
    const pending = shareFiles([prepared]);
    expect(share).toHaveBeenCalledExactlyOnceWith({ files: [prepared] });
    await expect(pending).resolves.toBe('saved');
    expect(anchor.click).not.toHaveBeenCalled();
  });
  it.each([
    ['AbortError', 'cancelled'],
    ['NotAllowedError', 'activation-required'],
  ] as const)('preserves %s without silently downloading', async (name, result) => {
    share.mockRejectedValue(new DOMException('native failure', name));
    await expect(shareFiles([file()])).resolves.toBe(result);
    expect(anchor.click).not.toHaveBeenCalled();
  });
  it('falls back to a single download for unsupported sharing and unexpected native errors', async () => {
    share.mockRejectedValue(new DOMException('unsupported', 'DataError'));
    await expect(shareFiles([file()])).resolves.toBe('saved');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    vi.stubGlobal('navigator', { userAgent: 'Android', canShare: () => false });
    await expect(shareFiles([file()])).resolves.toBe('saved');
    expect(anchor.click).toHaveBeenCalledTimes(2);
  });
  it('never drops multi-file exports and rejects oversize iOS batches before sharing', async () => {
    share.mockRejectedValue(new Error('native failure'));
    await expect(shareFiles([file(), file()])).rejects.toThrow('ZIP');
    share.mockClear();
    await expect(shareFiles(Array.from({ length: 21 }, file))).rejects.toThrow('20');
    expect(share).not.toHaveBeenCalled();
    expect(anchor.click).not.toHaveBeenCalled();
  });
  it('waits two seconds to revoke the download URL and cleans up even if click fails', () => {
    downloadFile(file());
    expect(anchor.download).toBe('vibeset-night-phone-1320x2868.jpg');
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1999);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:prepared');
    anchor.click.mockImplementationOnce(() => {
      throw new Error('download blocked');
    });
    expect(() => downloadFile(file())).toThrow('download blocked');
    vi.advanceTimersByTime(2000);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
  it('rejects empty files and propagates download failure without reporting success', async () => {
    await expect(shareFiles([new File([], 'empty.jpg')])).rejects.toThrow();
    vi.stubGlobal('navigator', { canShare: () => false });
    anchor.click.mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    await expect(shareFiles([file()])).rejects.toThrow('blocked');
  });
});

describe('URL sharing', () => {
  const input = { title: 'Night theme', url: 'https://vibeset.test/en/t/night' };
  it('calls native share before yielding and copies only when unsupported', async () => {
    const pending = shareUrl(input);
    expect(share).toHaveBeenCalledExactlyOnceWith(input);
    await expect(pending).resolves.toBe('shared');
    expect(clipboard).not.toHaveBeenCalled();
    vi.stubGlobal('navigator', { clipboard: { writeText: clipboard } });
    await expect(shareUrl(input)).resolves.toBe('copied');
    expect(clipboard).toHaveBeenCalledWith(input.url);
  });
  it.each([
    ['AbortError', 'cancelled'],
    ['NotAllowedError', 'activation-required'],
  ] as const)('does not copy after %s', async (name, result) => {
    share.mockRejectedValue(new DOMException('native failure', name));
    await expect(shareUrl(input)).resolves.toBe(result);
    expect(clipboard).not.toHaveBeenCalled();
  });
  it('copies after other native failures and propagates denied clipboard access', async () => {
    share.mockRejectedValue(new Error('unsupported'));
    await expect(shareUrl(input)).resolves.toBe('copied');
    clipboard.mockRejectedValue(new Error('denied'));
    await expect(copyUrl(input.url)).rejects.toThrow('denied');
  });
  it.each(['javascript:alert(1)', 'https://user:secret@vibeset.test/', 'data:text/html,hello'])(
    'rejects unsafe share URLs',
    async (url) => {
      await expect(shareUrl({ ...input, url })).rejects.toThrow();
      expect(share).not.toHaveBeenCalled();
      expect(clipboard).not.toHaveBeenCalled();
    },
  );
});
