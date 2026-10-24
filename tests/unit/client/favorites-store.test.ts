import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFavoritesStore } from '../../../lib/client/favorites-store';
import { readLocalFavorites, writeLocalFavorites } from '../../../lib/client/favorites-storage';
import {
  FAVORITES_KEY,
  MAX_LOCAL_FAVORITES,
  MAX_FAVORITES_STORAGE_LENGTH,
  type FavoriteMergeData,
  type FavoriteToggleData,
  type FavoritesBackend,
} from '../../../lib/favorites';
import type { ActionResult } from '../../../lib/result';
import {
  favoriteIdsResponseSchema,
  mergeLocalFavoritesSchema,
  toggleFavoriteSchema,
} from '../../../lib/validation/favorites';

const id = (index: number): string => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`;
const a = id(1),
  b = id(2),
  c = id(3);
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function backend(): FavoritesBackend & {
  list: ReturnType<typeof vi.fn>;
  merge: ReturnType<typeof vi.fn>;
  toggle: ReturnType<typeof vi.fn>;
} {
  return {
    list: vi.fn().mockResolvedValue([]),
    merge: vi.fn().mockResolvedValue({ ok: true, data: { merged: 1 } }),
    toggle: vi.fn().mockResolvedValue({ ok: true, data: { favorited: true } }),
  };
}
let stored: string | null;
const storage = {
  getItem: vi.fn(() => stored),
  setItem: vi.fn((_key: string, value: string) => {
    stored = value;
  }),
};
beforeEach(() => {
  stored = null;
  vi.clearAllMocks();
  storage.getItem.mockImplementation(() => stored);
  storage.setItem.mockImplementation((_key, value) => {
    stored = value;
  });
  vi.stubGlobal('localStorage', storage);
  writeLocalFavorites([]);
  stored = null;
  readLocalFavorites();
  storage.getItem.mockClear();
  storage.setItem.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('favorites input and storage boundaries', () => {
  it('normalizes and deduplicates UUIDs while refusing injected identity fields', () => {
    expect(mergeLocalFavoritesSchema.parse({ themeIds: [a.toUpperCase(), a, b] })).toEqual({
      themeIds: [a, b],
    });
    expect(toggleFavoriteSchema.safeParse({ themeId: a, userId: 'victim' }).success).toBe(false);
    expect(
      favoriteIdsResponseSchema.parse({ data: { themeIds: [a, b, a] } }).data.themeIds,
    ).toEqual([a, b]);
  });
  it.each([
    null,
    '{}',
    '{',
    JSON.stringify(['not-uuid']),
    'x'.repeat(MAX_FAVORITES_STORAGE_LENGTH + 1),
    JSON.stringify(Array.from({ length: 501 }, (_, i) => id(i))),
  ])('rejects raw corrupt or oversized storage before using ids', (raw) => {
    stored = raw;
    expect(readLocalFavorites()).toEqual([]);
  });
  it('keeps bounded storage usable when access/quota is denied and never exposes mutable fallback arrays', () => {
    storage.getItem.mockImplementation(() => {
      throw new Error('denied');
    });
    storage.setItem.mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeLocalFavorites([a])).not.toThrow();
    const read = readLocalFavorites();
    read.push(b);
    expect(readLocalFavorites()).toEqual([a]);
    expect(() =>
      writeLocalFavorites(Array.from({ length: MAX_LOCAL_FAVORITES + 1 }, (_, i) => id(i))),
    ).toThrow();
  });
  it('preserves in-tab writes when only writes are denied, and accepts a newer external value', () => {
    stored = JSON.stringify([a]);
    readLocalFavorites();
    storage.setItem.mockImplementation(() => {
      throw new Error('quota');
    });
    writeLocalFavorites([a, b]);
    expect(readLocalFavorites()).toEqual([a, b]);
    stored = JSON.stringify([c]);
    expect(readLocalFavorites()).toEqual([c]);
  });
  it('does not resurrect cleared storage after a later denial', () => {
    writeLocalFavorites([a]);
    stored = null;
    expect(readLocalFavorites()).toEqual([]);
    storage.getItem.mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readLocalFavorites()).toEqual([]);
  });
});

describe('favorites session/optimistic state machine', () => {
  it('does no browser read/network work before hydration and persists local toggles', async () => {
    const api = backend();
    const store = createFavoritesStore(api);
    expect(store.getSnapshot().status).toBe('loading');
    expect(api.list).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
    await store.setAccount(null);
    expect(await store.toggle(a)).toEqual({ ok: true, data: { favorited: true } });
    expect(store.getSnapshot().ids).toEqual([a]);
    expect(storage.setItem).toHaveBeenCalledWith(FAVORITES_KEY, JSON.stringify([a]));
    await store.toggle(a);
    expect(store.getSnapshot().ids).toEqual([]);
    expect(api.toggle).not.toHaveBeenCalled();
  });
  it('refuses the 501st local favorite while allowing removal at the limit', async () => {
    writeLocalFavorites(Array.from({ length: 500 }, (_, i) => id(i)));
    const store = createFavoritesStore(backend());
    await store.setAccount(null);
    expect(await store.toggle(id(501))).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(store.getSnapshot().ids).toHaveLength(500);
    await store.toggle(id(0));
    expect(store.getSnapshot().ids).toHaveLength(499);
  });
  it('merges before fetching, clears only submitted ids, and fetches once per settled session', async () => {
    writeLocalFavorites([a]);
    const api = backend();
    const merged = deferred<ActionResult<FavoriteMergeData>>();
    api.merge.mockReturnValueOnce(merged.promise);
    api.list.mockResolvedValue([a, c]);
    const store = createFavoritesStore(api);
    const load = store.setAccount('owner');
    await Promise.resolve();
    expect(api.merge).toHaveBeenCalledExactlyOnceWith([a]);
    expect(api.list).not.toHaveBeenCalled();
    writeLocalFavorites([a, b]);
    merged.resolve({ ok: true, data: { merged: 1 } });
    await load;
    expect(readLocalFavorites()).toEqual([b]);
    expect(store.getSnapshot()).toMatchObject({
      accountId: 'owner',
      ids: [a, c],
      status: 'ready',
      isSignedIn: true,
    });
    await store.setAccount('owner');
    expect(api.list).toHaveBeenCalledTimes(1);
  });
  it('keeps local ids when merging fails and supports an explicit retry', async () => {
    writeLocalFavorites([a]);
    const api = backend();
    api.merge.mockResolvedValueOnce({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'limited' },
    });
    const store = createFavoritesStore(api);
    await store.setAccount('owner');
    expect(store.getSnapshot()).toMatchObject({ status: 'error', error: 'RATE_LIMITED' });
    expect(readLocalFavorites()).toEqual([a]);
    expect(api.list).not.toHaveBeenCalled();
    await store.refresh();
    expect(store.getSnapshot().status).toBe('ready');
    expect(readLocalFavorites()).toEqual([]);
  });
  it('does not clear local ids or update the next account when a previous merge completes late', async () => {
    writeLocalFavorites([a]);
    const api = backend();
    const merged = deferred<ActionResult<FavoriteMergeData>>();
    api.merge.mockReturnValueOnce(merged.promise);
    const store = createFavoritesStore(api);
    const first = store.setAccount('first');
    await Promise.resolve();
    await store.setAccount(null);
    await store.toggle(b);
    merged.resolve({ ok: true, data: { merged: 1 } });
    await first;
    expect(store.getSnapshot()).toMatchObject({ accountId: null, ids: [b, a] });
    expect(readLocalFavorites()).toEqual([b, a]);
    expect(api.list).not.toHaveBeenCalled();
  });
  it('aborts an old account fetch and ignores even a noncooperative late response', async () => {
    const api = backend();
    const first = deferred<string[]>();
    api.list.mockReturnValueOnce(first.promise).mockResolvedValueOnce([b]);
    const store = createFavoritesStore(api);
    const load = store.setAccount('first');
    await Promise.resolve();
    const signal = api.list.mock.calls[0]?.[0] as AbortSignal;
    await store.setAccount('second');
    expect(signal.aborted).toBe(true);
    first.resolve([a]);
    await load;
    expect(store.getSnapshot()).toMatchObject({ accountId: 'second', ids: [b] });
  });
  it('deduplicates a pending theme toggle and rolls it back without disturbing other successful mutations', async () => {
    const api = backend();
    const failed = deferred<ActionResult<FavoriteToggleData>>();
    api.toggle
      .mockReturnValueOnce(failed.promise)
      .mockResolvedValueOnce({ ok: true, data: { favorited: true } });
    const store = createFavoritesStore(api);
    await store.setAccount('owner');
    const request = store.toggle(a);
    expect(store.toggle(a)).toBe(request);
    expect(store.getSnapshot()).toMatchObject({ ids: [a], pending: [a] });
    await store.toggle(b);
    failed.resolve({ ok: false, error: { code: 'NOT_FOUND', message: 'archived' } });
    await request;
    expect(store.getSnapshot()).toMatchObject({ ids: [b], pending: [] });
    expect(api.toggle).toHaveBeenCalledTimes(2);
  });
  it('rolls back network errors and ignores toggle results after logout/disposal', async () => {
    const api = backend();
    api.list.mockResolvedValue([a]);
    api.toggle.mockRejectedValueOnce(new Error('offline'));
    const store = createFavoritesStore(api);
    await store.setAccount('owner');
    expect(await store.toggle(a)).toMatchObject({ ok: false });
    expect(store.getSnapshot().ids).toEqual([a]);
    const late = deferred<ActionResult<FavoriteToggleData>>();
    api.toggle.mockReturnValueOnce(late.promise);
    const request = store.toggle(b);
    await store.setAccount(null);
    late.resolve({ ok: true, data: { favorited: true } });
    await request;
    expect(store.getSnapshot().ids).toEqual([]);
    store.dispose();
    await store.setAccount(null);
    expect(store.getSnapshot().status).toBe('ready');
  });
  it('waits for pending toggles before refreshing to avoid overwriting optimistic results with an old read', async () => {
    const api = backend();
    const pending = deferred<ActionResult<FavoriteToggleData>>();
    api.toggle.mockReturnValueOnce(pending.promise);
    const store = createFavoritesStore(api);
    await store.setAccount('owner');
    const request = store.toggle(a);
    const refresh = store.refresh();
    await Promise.resolve();
    expect(api.list).toHaveBeenCalledTimes(1);
    api.list.mockResolvedValueOnce([a]);
    pending.resolve({ ok: true, data: { favorited: true } });
    await Promise.all([request, refresh]);
    expect(store.getSnapshot().ids).toEqual([a]);
  });
  it('blocks new toggles immediately when refresh starts, before its first await', async () => {
    const api = backend();
    const pending = deferred<string[]>();
    const store = createFavoritesStore(api);
    await store.setAccount('owner');
    api.list.mockReturnValueOnce(pending.promise);
    const refresh = store.refresh();
    expect(await store.toggle(a)).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(api.toggle).not.toHaveBeenCalled();
    pending.resolve([]);
    await refresh;
  });
  it('clears private state while session identity is unknown and ignores stale failed refreshes', async () => {
    const api = backend();
    api.list.mockResolvedValueOnce([a]);
    const store = createFavoritesStore(api);
    await store.setAccount('first');
    const pending = deferred<string[]>();
    api.list.mockReturnValueOnce(pending.promise);
    const refresh = store.refresh();
    await Promise.resolve();
    await store.setAccount(undefined);
    pending.reject(new Error('offline'));
    await refresh;
    expect(store.getSnapshot()).toMatchObject({ ids: [], status: 'loading', accountId: undefined });
  });
});
