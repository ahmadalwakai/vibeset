import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDTO } from '../../../lib/dto';

const app: AppDTO = {
  slug: 'notes',
  name: 'Notes',
  aliases: ['ملاحظات'],
  category: 'productivity',
  glyph: 'note',
  rank: 1,
};
const response = (data: unknown): Response => Response.json({ data });
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('shared app catalogue loader', () => {
  it('deduplicates concurrent requests, omits credentials, and deeply freezes its result', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([app]));
    vi.stubGlobal('fetch', fetcher);
    const { loadAppCatalog } = await import('../../../lib/client/app-catalog');
    const [first, second] = await Promise.all([loadAppCatalog(), loadAppCatalog()]);
    expect(first).toBe(second);
    expect(await loadAppCatalog()).toBe(first);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/v1/apps', {
      credentials: 'omit',
      headers: { accept: 'application/json' },
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
    expect(Object.isFrozen(first[0]?.aliases)).toBe(true);
    expect(first).toEqual([app]);
  });

  it('aborts one caller while the shared fetch remains usable by another', async () => {
    let resolveResponse: (value: Response) => void = () => {
      throw new Error('Request not started');
    };
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    const { loadAppCatalog } = await import('../../../lib/client/app-catalog');
    const controller = new AbortController();
    const first = loadAppCatalog(controller.signal);
    const second = loadAppCatalog();
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    resolveResponse(response([app]));
    expect(await second).toEqual([app]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]).not.toContainEqual(
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('does not fetch for a pre-aborted caller', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { loadAppCatalog } = await import('../../../lib/client/app-catalog');
    const controller = new AbortController();
    controller.abort(new DOMException('Cancelled', 'AbortError'));
    await expect(loadAppCatalog(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('evicts network failures so retry performs a fresh request', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Offline'))
      .mockResolvedValueOnce(response([app]));
    vi.stubGlobal('fetch', fetcher);
    const { loadAppCatalog } = await import('../../../lib/client/app-catalog');
    await expect(loadAppCatalog()).rejects.toMatchObject({ code: 'NETWORK' });
    expect(await loadAppCatalog()).toEqual([app]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    { data: [{ ...app, rank: -1 }] },
    { data: [app, app] },
    { data: [{ ...app, glyph: '../unsafe' }] },
    { data: [{ ...app, slug: 'notes\n' }] },
    { items: [app] },
  ])('rejects malformed catalogues and retries after validation fails', async (body) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(body))
      .mockResolvedValueOnce(response([app]));
    vi.stubGlobal('fetch', fetcher);
    const { loadAppCatalog } = await import('../../../lib/client/app-catalog');
    await expect(loadAppCatalog()).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(await loadAppCatalog()).toEqual([app]);
  });

  it('maps API errors to safe codes and accepts a valid empty catalogue', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }))
      .mockResolvedValueOnce(response([]));
    vi.stubGlobal('fetch', fetcher);
    const { loadAppCatalog } = await import('../../../lib/client/app-catalog');
    await expect(loadAppCatalog()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(await loadAppCatalog()).toEqual([]);
  });

  it('evicts invalid JSON responses', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('{broken'))
      .mockResolvedValueOnce(response([app]));
    vi.stubGlobal('fetch', fetcher);
    const { loadAppCatalog } = await import('../../../lib/client/app-catalog');
    await expect(loadAppCatalog()).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(await loadAppCatalog()).toEqual([app]);
  });
});
