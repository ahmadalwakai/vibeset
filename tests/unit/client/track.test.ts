import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from '../../../lib/client/track';

const id = 'a0000000-0000-4000-8000-000000000001';
afterEach(() => vi.unstubAllGlobals());

describe('anonymous tracking transport', () => {
  it('posts only validated aggregate-event data, omits cookies and survives navigation', () => {
    vi.stubGlobal('window', {});
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    track(id.toUpperCase(), 'download');
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/track', {
      method: 'POST',
      credentials: 'omit',
      mode: 'same-origin',
      keepalive: true,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeId: id, event: 'download' }),
    });
  });
  it('ignores invalid identities and does nothing during server rendering', () => {
    vi.stubGlobal('window', {});
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    track('invalid', 'view');
    vi.stubGlobal('window', undefined);
    track(id, 'view');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('never interrupts the user on synchronous or asynchronous transport failure', async () => {
    vi.stubGlobal('window', {});
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('unloading');
      })
      .mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    expect(() => track(id, 'download')).not.toThrow();
    expect(() => track(id, 'view')).not.toThrow();
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
