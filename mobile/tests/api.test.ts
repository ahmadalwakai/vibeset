import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playgroundStateSchema, renderSampleSpec } from '../../content/render-sample';
import { encodeCursor, encodeOffsetCursor } from '../../lib/validation/cursor-boundaries';
import { fetchTheme, fetchThemes, NativeServiceError, type ThemeDetailDTO } from '../lib/api';

const transport = vi.fn<typeof fetch>();
const query = { sort: 'trending', limit: 24 } as const;
const theme: ThemeDetailDTO = {
  id: 'f5497e73-9a14-4d82-a1eb-baa931101bce',
  slug: 'lavender-haze',
  nameEn: 'Lavender Haze',
  nameAr: 'ضباب اللافندر',
  descriptionEn: null,
  descriptionAr: null,
  thumbUrl: null,
  dominantColor: null,
  tags: [],
  isFeatured: false,
  downloadCount: 0,
  favoriteCount: 0,
  creator: null,
  publishedAt: null,
  updatedAt: '2026-10-24T12:00:00.000Z',
  spec: renderSampleSpec(playgroundStateSchema.parse({ kind: 'mesh', palette: 'lavender' })),
  previewHomeUrl: null,
  previewLockUrl: null,
  ogUrl: null,
  wallpapers: [],
  remixOf: null,
};

beforeEach(() => {
  vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.vibeset.test');
  vi.stubGlobal('__DEV__', false);
  vi.stubGlobal('fetch', transport);
  transport.mockReset();
  transport.mockResolvedValue(Response.json({ data: { items: [theme], nextCursor: null } }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('native public API', () => {
  it('uses the required origin, a credential-free GET and the validated public envelope', async () => {
    const controller = new AbortController();
    const page = await fetchThemes(query, controller.signal);
    expect(page.items[0]?.slug).toBe(theme.slug);
    expect(page.nextCursor).toBeNull();
    expect(transport).toHaveBeenCalledWith('https://api.vibeset.test/api/v1/themes', {
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: expect.any(AbortSignal),
    });
    expect(transport.mock.calls[0]?.[1]?.signal).not.toBe(controller.signal);
    expect(controller.signal.aborted).toBe(false);
  });

  it('retains canonical search normalization and compatible opaque cursor serialization', async () => {
    const cursor = encodeOffsetCursor(24);
    await fetchThemes({ ...query, q: '  cafe\u0301  ', tags: ['calm', 'cute', 'calm'], cursor });
    const url = new URL(String(transport.mock.calls[0]?.[0]));
    expect(url.searchParams.get('q')).toBe('café');
    expect(url.searchParams.get('tags')).toBe('calm,cute');
    expect(url.searchParams.get('cursor')).toBe(cursor);
  });

  it('retains IDs lookup precedence and normalization', async () => {
    await fetchThemes({ ...query, ids: [theme.id.toUpperCase(), theme.id], q: 'x', limit: 48 });
    const url = new URL(String(transport.mock.calls[0]?.[0]));
    expect([...url.searchParams]).toEqual([['ids', theme.id]]);
  });

  it('refuses an incompatible cursor before requesting the server', async () => {
    const cursor = encodeCursor({ k: 'popular', s: 1, id: theme.id });
    await expect(fetchThemes({ ...query, cursor })).rejects.toMatchObject({
      code: 'HTTP',
      status: 422,
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it('fetches a complete theme and validates its ThemeSpec', async () => {
    transport.mockResolvedValue(Response.json({ data: theme }));
    expect(await fetchTheme(theme.slug)).toEqual(theme);
    expect(transport.mock.calls[0]?.[0]).toBe(
      'https://api.vibeset.test/api/v1/themes/lavender-haze',
    );
    transport.mockResolvedValue(Response.json({ data: { ...theme, spec: { v: 2 } } }));
    await expect(fetchTheme(theme.slug)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it.each(['../account', 'lavender\n', 'https://other.test', 'a/b'])(
    'refuses a non-slug detail path %s',
    async (slug) => {
      await expect(fetchTheme(slug)).rejects.toMatchObject({ code: 'HTTP', status: 422 });
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it.each([
    undefined,
    '',
    'http://api.vibeset.test',
    'https://user:password@api.vibeset.test',
    'https://api.vibeset.test/api',
    'https://api.vibeset.test?token=private',
    'https://api.vibeset.test#fragment',
    ' https://api.vibeset.test',
    'file:///data/catalog.json',
  ])('fails clearly for invalid or missing public configuration', async (origin) => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', origin);
    await expect(fetchThemes(query)).rejects.toBeInstanceOf(NativeServiceError);
    await expect(fetchThemes(query)).rejects.toMatchObject({ code: 'CONFIG' });
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://192.168.1.4:3000',
    'http://172.16.1.2:3000',
  ])('allows explicit development local HTTP origin %s', async (origin) => {
    vi.stubGlobal('__DEV__', true);
    vi.stubEnv('EXPO_PUBLIC_API_URL', origin);
    await fetchThemes(query);
    expect(transport.mock.calls[0]?.[0]).toBe(`${origin}/api/v1/themes`);
  });

  it('still refuses public insecure HTTP during development', async () => {
    vi.stubGlobal('__DEV__', true);
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://api.vibeset.test');
    await expect(fetchThemes(query)).rejects.toMatchObject({ code: 'CONFIG' });
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    { status: 404, code: 'NOT_FOUND' },
    { status: 422, code: 'HTTP' },
    { status: 429, code: 'HTTP' },
    { status: 503, code: 'HTTP' },
  ])(
    'returns a controlled error for HTTP $status without exposing response text',
    async ({ status, code }) => {
      transport.mockResolvedValue(new Response('private diagnostic', { status }));
      await expect(fetchThemes(query)).rejects.toMatchObject({ code, status });
      await expect(fetchThemes(query)).rejects.not.toThrow('private diagnostic');
    },
  );

  it.each([
    new Response('<html>provider login</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    Response.json({ items: [] }),
    Response.json({ data: { items: [{ id: 'fabricated' }], nextCursor: null } }),
  ])(
    'refuses invalid responses rather than returning an empty successful catalogue',
    async (response) => {
      transport.mockResolvedValue(response);
      await expect(fetchThemes(query)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    },
  );

  it('maps a transport failure to NETWORK', async () => {
    transport.mockRejectedValue(new Error('private native transport details'));
    await expect(fetchThemes(query)).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('does not start an already-cancelled request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(fetchThemes(query, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it('rejects a response that arrived after cancellation', async () => {
    const controller = new AbortController();
    transport.mockImplementation(async () => {
      controller.abort();
      return Response.json({ data: { items: [theme], nextCursor: null } });
    });
    await expect(fetchThemes(query, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('bounds a stalled fetch even if the transport never settles after abort', async () => {
    vi.useFakeTimers();
    transport.mockImplementation(() => new Promise<Response>(() => {}));
    const pending = fetchThemes(query);
    const settled = vi.fn();
    void pending.then(settled, settled);
    const failed = expect(pending).rejects.toMatchObject({ code: 'NETWORK' });
    await vi.advanceTimersByTimeAsync(19_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await failed;
    expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the same deadline for a stalled JSON body after slow response headers', async () => {
    vi.useFakeTimers();
    const response = Response.json({ data: { items: [theme], nextCursor: null } });
    const body = vi
      .spyOn(response, 'json')
      .mockImplementation(() => new Promise<unknown>(() => {}));
    transport.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(response), 15_000);
        }),
    );
    const pending = fetchThemes(query);
    const settled = vi.fn();
    void pending.then(settled, settled);
    const failed = expect(pending).rejects.toMatchObject({ code: 'NETWORK' });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(body).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await failed;
    expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    Object.assign(new Error('Screen changed'), { name: 'AbortError' }),
    'caller-owned abort reason',
  ])(
    'preserves caller cancellation during JSON reading and releases its listener',
    async (reason) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, 'addEventListener');
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const response = Response.json({ data: theme });
      vi.spyOn(response, 'json').mockImplementation(() => new Promise<unknown>(() => {}));
      transport.mockResolvedValue(response);
      const pending = fetchTheme(theme.slug, controller.signal);
      const failed = expect(pending).rejects.toBe(reason);
      await vi.advanceTimersByTimeAsync(0);
      controller.abort(reason);
      await failed;
      expect(transport.mock.calls[0]?.[1]?.signal?.reason).toBe(reason);
      expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([200, 404, 503])('clears deadline and caller listener after HTTP %s', async (status) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    transport.mockResolvedValue(
      Response.json({ data: { items: [], nextCursor: null } }, { status }),
    );
    if (status === 200)
      await expect(fetchThemes(query, controller.signal)).resolves.toEqual({
        items: [],
        nextCursor: null,
      });
    else
      await expect(fetchThemes(query, controller.signal)).rejects.toBeInstanceOf(
        NativeServiceError,
      );
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1]);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(controller.signal.aborted).toBe(false);
  });
});
