import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlyphWeight } from '../../../lib/render/types';

const safeGlyph = { heart: '<path d="M0 0L2 2Z"/>' };

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('browser glyph loading', () => {
  it('shares requests and exposes only loaded weights', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(safeGlyph)));
    vi.stubGlobal('fetch', fetcher);
    const { loadGlyphs } = await import('../../../lib/client/glyphs');
    const [first, second] = await Promise.all([loadGlyphs('regular'), loadGlyphs('regular')]);
    expect(first).toBe(second);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/glyphs/v1/regular.json');
    expect(first.get('heart', 'regular')).toBe(safeGlyph.heart);
    expect(first.get('heart', 'bold')).toBeUndefined();
    expect(first.get('constructor', 'regular')).toBeUndefined();
  });
  it('retries failed or unsafe JSON instead of retaining a rejected promise', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ heart: '<script>alert(1)</script>' })))
      .mockResolvedValueOnce(new Response(JSON.stringify(safeGlyph)));
    vi.stubGlobal('fetch', fetcher);
    const { loadGlyphs } = await import('../../../lib/client/glyphs');
    await expect(loadGlyphs('bold')).rejects.toThrow('503');
    await expect(loadGlyphs('bold')).rejects.toThrow();
    expect((await loadGlyphs('bold')).get('heart', 'bold')).toBe(safeGlyph.heart);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('aborts one caller while preserving the shared request for another', async () => {
    let respond: (response: Response) => void = () => {
      throw new Error('Fetch not started');
    };
    const fetcher = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    const { loadGlyphs } = await import('../../../lib/client/glyphs');
    const controller = new AbortController();
    const cancelled = loadGlyphs('fill', controller.signal);
    const remaining = loadGlyphs('fill');
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    respond(new Response(JSON.stringify(safeGlyph)));
    expect((await remaining).get('heart', 'fill')).toBe(safeGlyph.heart);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects pre-aborted and invalid requests before fetching', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { loadGlyphs } = await import('../../../lib/client/glyphs');
    const controller = new AbortController();
    controller.abort();
    await expect(loadGlyphs('thin', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(() => loadGlyphs('invalid' as GlyphWeight)).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
