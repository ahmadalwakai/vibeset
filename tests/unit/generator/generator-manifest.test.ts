import { readFile } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof FsPromises>()),
  readFile: vi.fn(),
}));

const valid = JSON.stringify([{ name: 'heart', categories: ['nature'] }, { name: 'star' }]);

beforeEach(() => {
  vi.resetModules();
  vi.mocked(readFile).mockReset();
});

describe('generator manifest input boundary', () => {
  it('shares concurrent work and retries after an I/O failure', async () => {
    vi.mocked(readFile)
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce(valid);
    const { loadGeneratorManifest } = await import('../../../server/render/generator-preview');
    const pending = loadGeneratorManifest();
    expect(loadGeneratorManifest()).toBe(pending);
    await expect(pending).rejects.toThrow('Unavailable');
    expect(await loadGeneratorManifest()).toEqual(new Set(['heart', 'star']));
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it.each([
    'not JSON',
    JSON.stringify([]),
    JSON.stringify(null),
    JSON.stringify([{ name: '../heart' }]),
    JSON.stringify([{ name: 'heart\n' }]),
    JSON.stringify([{ name: 'heart' }, { name: 'heart' }]),
    JSON.stringify(Array.from({ length: 2001 }, (_, index) => ({ name: `glyph-${index}` }))),
  ])('rejects invalid manifest content and permits a corrected retry', async (invalid) => {
    vi.mocked(readFile).mockResolvedValueOnce(invalid).mockResolvedValueOnce(valid);
    const { loadGeneratorManifest } = await import('../../../server/render/generator-preview');
    await expect(loadGeneratorManifest()).rejects.toThrow();
    expect(await loadGeneratorManifest()).toEqual(new Set(['heart', 'star']));
    expect(readFile).toHaveBeenCalledTimes(2);
  });
});
