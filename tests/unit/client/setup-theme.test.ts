import { afterEach, describe, expect, it, vi } from 'vitest';
import { playgroundStateSchema, renderSampleSpec } from '../../../content/render-sample';
import type { ThemeDetailDTO } from '../../../lib/dto';
import { loadSetupTheme } from '../../../lib/client/setup-theme';

const theme: ThemeDetailDTO = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'lavender-dream',
  nameEn: 'Lavender dream',
  nameAr: null,
  thumbUrl: null,
  dominantColor: '#eee7fa',
  tags: [],
  isFeatured: false,
  downloadCount: 0,
  favoriteCount: 0,
  creator: null,
  publishedAt: '2026-10-24T12:00:00.000Z',
  updatedAt: '2026-10-24T12:00:00.000Z',
  descriptionEn: null,
  descriptionAr: null,
  spec: renderSampleSpec(playgroundStateSchema.parse({})),
  previewHomeUrl: null,
  previewLockUrl: null,
  ogUrl: null,
  wallpapers: [],
  remixOf: null,
};
afterEach(() => vi.unstubAllGlobals());

describe('optional setup theme loading', () => {
  it('loads validated public detail with caller cancellation and without credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: theme }));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    expect(await loadSetupTheme(theme.slug, controller.signal)).toEqual(theme);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/v1/themes/lavender-dream', {
      signal: controller.signal,
      credentials: 'omit',
      headers: { accept: 'application/json' },
    });
  });

  it.each(['../secret', 'theme\n', '', 'عربي'])(
    'rejects invalid slugs %j before fetching',
    async (slug) => {
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      await expect(loadSetupTheme(slug)).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    { data: { ...theme, slug: 'other-theme' } },
    { data: { ...theme, spec: {} } },
    { data: { ...theme, updatedAt: 'invalid' } },
    {
      data: {
        ...theme,
        wallpapers: [{ size: 'phone', url: 'javascript:alert(1)', w: 1, h: 1, bytes: 1 }],
      },
    },
    { error: { code: 'NOT_FOUND' } },
  ])('rejects invalid or mismatched details', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    await expect(loadSetupTheme(theme.slug)).rejects.toThrow();
  });

  it('refuses HTTP failures and empty responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(new Response(null, { status: 200 })),
    );
    await expect(loadSetupTheme(theme.slug)).rejects.toThrow('unavailable');
    await expect(loadSetupTheme(theme.slug)).rejects.toThrow('empty');
  });

  it('bounds streamed input and cancels an oversized body', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1_048_577));
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await expect(loadSetupTheme(theme.slug)).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects malformed UTF-8 and JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(new Uint8Array([255])))
        .mockResolvedValueOnce(new Response('{broken')),
    );
    await expect(loadSetupTheme(theme.slug)).rejects.toThrow();
    await expect(loadSetupTheme(theme.slug)).rejects.toThrow();
  });

  it('propagates aborts without returning stale theme data', async () => {
    const error = new DOMException('Cancelled', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
    await expect(loadSetupTheme(theme.slug)).rejects.toBe(error);
  });
});
