import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlyphManifestEntry } from '@/lib/icon-export';

const entries: GlyphManifestEntry[] = [
  { name: 'heart', categories: ['shapes'], tags: ['love', 'قَلْب'] },
  { name: 'moon-stars', categories: ['weather'], tags: ['night', 'café'] },
];
const response = (value: unknown): Response => new Response(JSON.stringify(value), { status: 200 });

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('shared glyph metadata', () => {
  it('shares one pending request and its validated result across callers', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(entries));
    vi.stubGlobal('fetch', fetcher);
    const { loadGlyphManifest } = await import('@/lib/client/glyph-manifest');
    const [first, second] = await Promise.all([loadGlyphManifest(), loadGlyphManifest()]);
    expect(first).toEqual(entries);
    expect(second).toBe(first);
    expect(await loadGlyphManifest()).toBe(first);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/glyphs/v1/manifest.json');
  });

  it('cancels one caller without cancelling the shared request', async () => {
    let finish: (value: Response) => void = () => {
      throw new Error('Request not started');
    };
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    const { loadGlyphManifest } = await import('@/lib/client/glyph-manifest');
    const controller = new AbortController();
    const cancelled = loadGlyphManifest(controller.signal);
    const active = loadGlyphManifest();
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    finish(response(entries));
    await expect(active).resolves.toEqual(entries);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('does not start a request for an already aborted caller', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { loadGlyphManifest } = await import('@/lib/client/glyph-manifest');
    const controller = new AbortController();
    controller.abort();
    await expect(loadGlyphManifest(controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { invalid: [{ ...entries[0], name: '<script>' }] },
    { invalid: [entries[0], entries[0]] },
    { invalid: [{ name: 'heart', categories: ['shapes'], tags: 'love' }] },
  ])('rejects invalid metadata and permits a fresh retry', async ({ invalid }) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(invalid))
      .mockResolvedValueOnce(response(entries));
    vi.stubGlobal('fetch', fetcher);
    const { loadGlyphManifest } = await import('@/lib/client/glyph-manifest');
    await expect(loadGlyphManifest()).rejects.toThrow();
    await expect(loadGlyphManifest()).resolves.toEqual(entries);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('evicts an HTTP failure and rejects oversized metadata', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response('x'.repeat(1_048_577)))
      .mockResolvedValueOnce(response(entries));
    vi.stubGlobal('fetch', fetcher);
    const { loadGlyphManifest } = await import('@/lib/client/glyph-manifest');
    await expect(loadGlyphManifest()).rejects.toThrow('unavailable');
    await expect(loadGlyphManifest()).rejects.toThrow('large');
    await expect(loadGlyphManifest()).resolves.toEqual(entries);
  });

  it('searches names, categories and tags without diacritic or case barriers', async () => {
    const { searchGlyphManifest } = await import('@/lib/client/glyph-manifest');
    expect(searchGlyphManifest(entries, 'MOON cafe').entries.map(({ name }) => name)).toEqual([
      'moon-stars',
    ]);
    expect(searchGlyphManifest(entries, 'قلب shapes').entries.map(({ name }) => name)).toEqual([
      'heart',
    ]);
    expect(searchGlyphManifest(entries, 'missing').total).toBe(0);
  });

  it('caps rendered results at 120 while retaining the total for accessible feedback', async () => {
    const { searchGlyphManifest } = await import('@/lib/client/glyph-manifest');
    const values = Array.from({ length: 130 }, (_, index) => ({
      name: 'glyph-' + index,
      categories: [],
      tags: ['shape'],
    }));
    const result = searchGlyphManifest(values, 'shape');
    expect(result.entries).toEqual(values.slice(0, 120));
    expect(result.total).toBe(130);
    expect(values).toHaveLength(130);
  });
});
