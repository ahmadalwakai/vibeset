import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createViewStatisticsPreferenceStore,
  viewStatisticsPreferenceStore,
} from '@/lib/client/view-statistics-preference';
import { VIEW_STATISTICS_KEY } from '@/lib/validation/view-statistics';
import { observeThemeView } from '@/lib/client/track-view';

function fixture(initial: string | null = null) {
  let raw = initial;
  let refresh: (() => void) | undefined;
  const stop = vi.fn();
  const storage = {
    getItem: vi.fn(() => raw),
    setItem: vi.fn((_key: string, value: string) => {
      raw = value;
    }),
  };
  const listen = vi.fn((callback: () => void) => {
    refresh = callback;
    return stop;
  });
  const store = createViewStatisticsPreferenceStore({ storage: () => storage, listen });
  return {
    store,
    storage,
    listen,
    stop,
    raw: () => raw,
    external: (value: string | null) => {
      raw = value;
      refresh?.();
    },
    notify: () => refresh?.(),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('optional automatic view preference', () => {
  it('renders off on the server and reads without writing a default choice', () => {
    const { store, storage } = fixture();
    expect(store.getServerSnapshot()).toEqual({
      ready: false,
      enabled: false,
      persistence: 'none',
    });
    expect(storage.getItem).not.toHaveBeenCalled();
    const stop = store.subscribe(vi.fn());
    expect(store.getSnapshot()).toEqual({ ready: true, enabled: false, persistence: 'none' });
    expect(storage.getItem).toHaveBeenCalledWith(VIEW_STATISTICS_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
    stop();
  });

  it.each([
    null,
    '',
    'true',
    '1',
    '{',
    '[]',
    '{}',
    '{"v":2,"enabled":true}',
    '{"v":1,"enabled":"true"}',
    '{"v":1,"enabled":true,"visitor":"ignored"}',
    ' '.repeat(129),
  ])('fails closed for absent, corrupt or unbounded storage %j', (raw) => {
    const { store, storage } = fixture(raw);
    const stop = store.subscribe(vi.fn());
    expect(store.getSnapshot()).toEqual({ ready: true, enabled: false, persistence: 'none' });
    expect(storage.setItem).not.toHaveBeenCalled();
    stop();
  });

  it('persists only an explicit choice as a versioned boolean without an identity', () => {
    const first = fixture();
    const stop = first.store.subscribe(vi.fn());
    first.store.setEnabled(true);
    expect(first.storage.setItem).toHaveBeenCalledExactlyOnceWith(
      VIEW_STATISTICS_KEY,
      '{"v":1,"enabled":true}',
    );
    expect(first.store.getSnapshot()).toEqual({ ready: true, enabled: true, persistence: 'local' });
    stop();
    const second = fixture(first.raw());
    const stopSecond = second.store.subscribe(vi.fn());
    expect(second.store.getSnapshot().enabled).toBe(true);
    second.store.setEnabled(false);
    expect(second.raw()).toBe('{"v":1,"enabled":false}');
    stopSecond();
  });

  it('keeps blocked-storage choices only in this module/tab without throwing', () => {
    const store = createViewStatisticsPreferenceStore({
      storage: () => {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
    const stop = store.subscribe(vi.fn());
    expect(store.getSnapshot().enabled).toBe(false);
    expect(() => store.setEnabled(true)).not.toThrow();
    expect(store.getSnapshot()).toEqual({ ready: true, enabled: true, persistence: 'tab' });
    stop();
    const remount = store.subscribe(vi.fn());
    expect(store.getSnapshot().enabled).toBe(true);
    store.setEnabled(false);
    expect(store.getSnapshot()).toEqual({ ready: true, enabled: false, persistence: 'tab' });
    remount();
  });

  it('does not restore an old saved opt-in after an explicit opt-out cannot be written', () => {
    const value = fixture('{"v":1,"enabled":true}');
    const stop = value.store.subscribe(vi.fn());
    value.storage.setItem.mockImplementation(() => {
      throw new DOMException('Quota', 'QuotaExceededError');
    });
    value.store.setEnabled(false);
    expect(value.store.getSnapshot().enabled).toBe(false);
    stop();
    const remount = value.store.subscribe(vi.fn());
    value.notify();
    expect(value.store.getSnapshot()).toEqual({ ready: true, enabled: false, persistence: 'tab' });
    value.external('{"v":1,"enabled":false}');
    expect(value.store.getSnapshot().persistence).toBe('local');
    remount();
  });

  it.each([
    ['{"v":1,"enabled":false}', 'local'],
    [null, 'none'],
    ['corrupt', 'none'],
  ] as const)(
    'ends a tab-only opt-in when recovered storage reports external %j',
    (raw, persistence) => {
      const value = fixture();
      value.storage.getItem.mockImplementation(() => {
        throw new DOMException('Blocked', 'SecurityError');
      });
      value.storage.setItem.mockImplementation(() => {
        throw new DOMException('Blocked', 'SecurityError');
      });
      const stop = value.store.subscribe(vi.fn());
      value.store.setEnabled(true);
      expect(value.store.getSnapshot()).toEqual({ ready: true, enabled: true, persistence: 'tab' });

      value.storage.getItem.mockImplementation(value.raw);
      value.external(raw);
      expect(value.store.getSnapshot()).toEqual({ ready: true, enabled: false, persistence });
      expect(value.storage.setItem).toHaveBeenCalledOnce();
      stop();
      const remount = value.store.subscribe(vi.fn());
      expect(value.store.getSnapshot().enabled).toBe(false);
      remount();
    },
  );

  it('preserves an unsaved explicit opt-out against a recovered opt-in with an unknown baseline', () => {
    const value = fixture();
    value.storage.getItem.mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    value.storage.setItem.mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    const stop = value.store.subscribe(vi.fn());
    value.store.setEnabled(true);
    value.store.setEnabled(false);
    value.storage.getItem.mockImplementation(value.raw);
    value.external('{"v":1,"enabled":true}');
    expect(value.store.getSnapshot()).toEqual({ ready: true, enabled: false, persistence: 'tab' });
    stop();
  });

  it('aborts the active view and prevents later marker access after a recovered cross-tab opt-out', () => {
    const value = fixture();
    value.storage.getItem.mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    value.storage.setItem.mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    const markers = vi.fn(() => ({ getItem: () => null, setItem: () => {} }));
    const send = vi.fn();
    const dependencies = {
      preference: value.store,
      storage: markers,
      send,
      seen: new Set<string>(),
    };
    const stop = observeThemeView('11111111-1111-4111-8111-111111111111', dependencies);
    value.store.setEnabled(true);
    const signal: unknown = send.mock.calls[0]?.[2];
    if (!(signal instanceof AbortSignal)) throw new Error('Missing active view signal');
    expect(signal.aborted).toBe(false);

    value.storage.getItem.mockImplementation(value.raw);
    value.external('{"v":1,"enabled":false}');
    expect(signal.aborted).toBe(true);
    const next = observeThemeView('22222222-2222-4222-8222-222222222222', dependencies);
    expect(markers).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
    next();
    stop();
  });

  it('refreshes cross-tab choices, fails closed for removal/corruption and never echoes writes', () => {
    const value = fixture();
    const changed = vi.fn();
    const stop = value.store.subscribe(changed);
    value.external('{"v":1,"enabled":true}');
    expect(value.store.getSnapshot().enabled).toBe(true);
    value.external('{"v":1,"enabled":false}');
    expect(value.store.getSnapshot().enabled).toBe(false);
    value.external('{"v":1,"enabled":true}');
    value.external('corrupt');
    expect(value.store.getSnapshot().enabled).toBe(false);
    value.external(null);
    expect(value.store.getSnapshot().persistence).toBe('none');
    expect(changed).toHaveBeenCalledTimes(5);
    expect(value.storage.setItem).not.toHaveBeenCalled();
    stop();
  });

  it('shares one storage subscription and stable snapshots between mounted controls', () => {
    const value = fixture();
    const first = value.store.subscribe(vi.fn());
    const snapshot = value.store.getSnapshot();
    const second = value.store.subscribe(vi.fn());
    value.notify();
    expect(value.store.getSnapshot()).toBe(snapshot);
    expect(value.listen).toHaveBeenCalledOnce();
    first();
    expect(value.stop).not.toHaveBeenCalled();
    second();
    expect(value.stop).toHaveBeenCalledOnce();
  });

  it('ignores stale storage-event values and other stores by reading the latest local choice', () => {
    let raw: string | null = null;
    let listener:
      | ((event: { key: string | null; storageArea: unknown; newValue?: string }) => void)
      | undefined;
    const local = { getItem: vi.fn(() => raw), setItem: vi.fn() };
    const remove = vi.fn();
    vi.stubGlobal('window', {
      localStorage: local,
      addEventListener: vi.fn((_type: string, callback: typeof listener) => {
        listener = callback;
      }),
      removeEventListener: remove,
    });
    const stop = viewStatisticsPreferenceStore.subscribe(vi.fn());
    raw = '{"v":1,"enabled":true}';
    listener?.({ key: 'other-key', storageArea: local });
    listener?.({ key: VIEW_STATISTICS_KEY, storageArea: {} });
    expect(viewStatisticsPreferenceStore.getSnapshot().enabled).toBe(false);
    raw = '{"v":1,"enabled":false}';
    listener?.({
      key: VIEW_STATISTICS_KEY,
      storageArea: local,
      newValue: '{"v":1,"enabled":true}',
    });
    expect(viewStatisticsPreferenceStore.getSnapshot().enabled).toBe(false);
    raw = '{"v":1,"enabled":true}';
    listener?.({ key: VIEW_STATISTICS_KEY, storageArea: local });
    expect(viewStatisticsPreferenceStore.getSnapshot().enabled).toBe(true);
    raw = null;
    listener?.({ key: null, storageArea: local });
    expect(viewStatisticsPreferenceStore.getSnapshot().enabled).toBe(false);
    expect(local.setItem).not.toHaveBeenCalled();
    stop();
    expect(remove).toHaveBeenCalledWith('storage', listener);
  });
});
