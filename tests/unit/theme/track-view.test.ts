import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/client/track';
import { observeThemeView, trackViewOnce } from '@/lib/client/track-view';
import { createViewStatisticsPreferenceStore } from '@/lib/client/view-statistics-preference';

const THEME_A = '11111111-1111-4111-8111-111111111111';
const THEME_B = '22222222-2222-4222-8222-222222222222';

function fixture(enabled: boolean | null = true) {
  let choice = enabled === null ? null : JSON.stringify({ v: 1, enabled });
  let refreshed: (() => void) | undefined;
  const preference = createViewStatisticsPreferenceStore({
    storage: () => ({
      getItem: () => choice,
      setItem: (_key, value) => {
        choice = value;
      },
    }),
    listen: (callback) => {
      refreshed = callback;
      return () => {};
    },
  });
  const values = new Map<string, string>();
  const markers = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
  const dependencies = {
    preference,
    storage: vi.fn(() => markers),
    send: vi.fn(),
    seen: new Set<string>(),
  };
  return {
    dependencies,
    markers,
    external: (raw: string) => {
      choice = raw;
      refreshed?.();
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('optional theme view session guard', () => {
  it.each([false, null])(
    'never accesses markers or posts a view for saved/default off (%j)',
    (choice) => {
      const { dependencies } = fixture(choice);
      const fetcher = vi.fn();
      vi.stubGlobal('window', {});
      vi.stubGlobal('fetch', fetcher);
      dependencies.storage.mockImplementation(() => {
        throw new Error('A disabled view must not access sessionStorage');
      });
      const stop = observeThemeView(THEME_A, { ...dependencies, send: track });
      expect(dependencies.storage).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
      expect(dependencies.seen.size).toBe(0);
      stop();
    },
  );

  it('deduplicates remounts and later instances with the enabled session marker', () => {
    const { dependencies, markers } = fixture();
    const stop = observeThemeView(THEME_A, dependencies);
    const signal = dependencies.send.mock.calls[0]?.[2];
    expect(signal).toBeInstanceOf(AbortSignal);
    const again = observeThemeView(THEME_A, dependencies);
    const fresh = observeThemeView(THEME_A, { ...dependencies, seen: new Set() });
    expect(dependencies.send).toHaveBeenCalledExactlyOnceWith(THEME_A, 'view', signal);
    expect(markers.getItem('vibeset:viewed:' + THEME_A)).toBe('1');
    stop();
    again();
    fresh();
  });

  it('records different themes separately and allows a new browser session', () => {
    const first = fixture();
    const stopA = observeThemeView(THEME_A, first.dependencies);
    const stopB = observeThemeView(THEME_B, first.dependencies);
    expect(first.dependencies.send.mock.calls.map(([id, event]) => [id, event])).toEqual([
      [THEME_A, 'view'],
      [THEME_B, 'view'],
    ]);
    const second = fixture();
    const stopNew = observeThemeView(THEME_A, second.dependencies);
    expect(second.dependencies.send).toHaveBeenCalledOnce();
    stopA();
    stopB();
    stopNew();
  });

  it.each(['true', '0', 'null', '1\n', '"1"'])(
    'does not trust malformed stored marker %j after explicit enabling',
    (marker) => {
      const { dependencies, markers } = fixture();
      markers.setItem('vibeset:viewed:' + THEME_A, marker);
      const stop = observeThemeView(THEME_A, dependencies);
      expect(dependencies.send).toHaveBeenCalledOnce();
      stop();
    },
  );

  it('keeps a memory guard when opted-in session storage is blocked', () => {
    const { dependencies } = fixture();
    dependencies.storage.mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    const first = observeThemeView(THEME_A, dependencies);
    const second = observeThemeView(THEME_A, dependencies);
    expect(dependencies.send).toHaveBeenCalledOnce();
    first();
    second();
  });

  it('marks before sending to prevent synchronous re-entry duplication', () => {
    const { dependencies } = fixture();
    dependencies.send.mockImplementation((_id, _event, signal: AbortSignal) => {
      trackViewOnce(THEME_A, dependencies, signal);
    });
    const stop = observeThemeView(THEME_A, dependencies);
    expect(dependencies.send).toHaveBeenCalledOnce();
    stop();
  });

  it('reacts to explicit and cross-tab choices, aborts withdrawal and never duplicates re-enable', () => {
    const { dependencies, external, markers } = fixture(false);
    const stop = observeThemeView(THEME_A, dependencies);
    dependencies.preference.setEnabled(true);
    const signal: unknown = dependencies.send.mock.calls[0]?.[2];
    if (!(signal instanceof AbortSignal)) throw new Error('Missing view signal');
    expect(signal.aborted).toBe(false);
    external('{"v":1,"enabled":false}');
    expect(signal.aborted).toBe(true);
    const reads = markers.getItem.mock.calls.length;
    external('{"v":1,"enabled":true}');
    expect(dependencies.send).toHaveBeenCalledOnce();
    expect(markers.getItem).toHaveBeenCalledTimes(reads);
    stop();
  });

  it('does not allow stale enabled work or an aborted request to touch markers', () => {
    const { dependencies, markers } = fixture();
    const stop = dependencies.preference.subscribe(vi.fn());
    const controller = new AbortController();
    dependencies.preference.setEnabled(false);
    trackViewOnce(THEME_A, dependencies, controller.signal);
    dependencies.preference.setEnabled(true);
    controller.abort();
    trackViewOnce(THEME_A, dependencies, controller.signal);
    expect(dependencies.storage).not.toHaveBeenCalled();
    expect(markers.setItem).not.toHaveBeenCalled();
    expect(dependencies.send).not.toHaveBeenCalled();
    stop();
  });

  it('only posts a real validated view after enabling and forwards its abort signal', () => {
    const { dependencies } = fixture(false);
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('window', {});
    vi.stubGlobal('fetch', fetcher);
    const stop = observeThemeView(THEME_A, { ...dependencies, send: track });
    dependencies.preference.setEnabled(true);
    expect(fetcher).toHaveBeenCalledOnce();
    const request: unknown = fetcher.mock.calls[0]?.[1];
    expect(request).toMatchObject({
      body: JSON.stringify({ themeId: THEME_A, event: 'view' }),
      credentials: 'omit',
      signal: expect.any(AbortSignal),
    });
    stop();
    if (typeof request !== 'object' || request === null || !('signal' in request))
      throw new Error('Missing abort signal');
    expect(request.signal).toHaveProperty('aborted', true);
  });

  it('rejects invalid theme identities before marker access', () => {
    const { dependencies } = fixture();
    const stop = observeThemeView('not-a-theme', dependencies);
    expect(dependencies.storage).not.toHaveBeenCalled();
    expect(dependencies.send).not.toHaveBeenCalled();
    stop();
  });
});
