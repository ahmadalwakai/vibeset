import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  favoritesSessionSnapshot,
  refreshFavoritesSession,
  resolveFavoritesSession,
  toggleFavoritesForSession,
} from '../../../lib/client/favorites-session';
import { createFavoritesStore } from '../../../lib/client/favorites-store';
import { readLocalFavorites, writeLocalFavorites } from '../../../lib/client/favorites-storage';
import { sessionErrorCode } from '../../../lib/client/session-error';
import type { FavoritesBackend } from '../../../lib/favorites';

const themeId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const guest = { data: null, error: null, isPending: false, isRefetching: false };
const signedIn = { ...guest, data: { user: { id: 'fixture-owner' } } };
const limited = { ...guest, error: { status: 429 } };
let stored: string | null = null;
const storage = {
  getItem: vi.fn(() => stored),
  setItem: vi.fn((_key: string, value: string) => {
    stored = value;
  }),
};

function backend(): FavoritesBackend & {
  list: ReturnType<typeof vi.fn>;
  merge: ReturnType<typeof vi.fn>;
  toggle: ReturnType<typeof vi.fn>;
} {
  return {
    list: vi.fn().mockResolvedValue([]),
    merge: vi.fn().mockResolvedValue({ ok: true, data: { merged: 0 } }),
    toggle: vi.fn().mockResolvedValue({ ok: true, data: { favorited: true } }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stored = null;
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

describe('favorites identity after a failed session request', () => {
  it.each([
    { error: { status: 429 }, expected: 'RATE_LIMITED' },
    { error: new Error('fixture network failure'), expected: 'NETWORK' },
    { error: { status: 503 }, expected: 'NETWORK' },
  ] as const)(
    'does not turn $expected into an anonymous local save',
    async ({ error, expected }) => {
      stored = JSON.stringify([otherId]);
      const session = { ...guest, error };
      const identity = resolveFavoritesSession(session);
      const api = backend();
      const store = createFavoritesStore(api);
      await store.setAccount(identity.userId);

      expect(identity).toMatchObject({ userId: undefined, error: expected, failed: true });
      expect(favoritesSessionSnapshot(store.getSnapshot(), identity)).toMatchObject({
        ids: [],
        pending: [],
        status: 'error',
        error: expected,
        isSignedIn: false,
      });
      expect(await toggleFavoritesForSession(store, () => session, themeId)).toMatchObject({
        ok: false,
      });
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(stored).toBe(JSON.stringify([otherId]));
      expect(api.list).not.toHaveBeenCalled();
      expect(api.merge).not.toHaveBeenCalled();
      expect(api.toggle).not.toHaveBeenCalled();
    },
  );

  it('masks a retained private snapshot and stays masked while its failed lookup retries', async () => {
    const api = backend();
    api.list.mockResolvedValueOnce([themeId]);
    const store = createFavoritesStore(api);
    await store.setAccount('fixture-owner');
    const stale = store.getSnapshot();
    const failure = resolveFavoritesSession({ ...signedIn, error: { status: 429 } });
    expect(favoritesSessionSnapshot(stale, failure)).toMatchObject({ ids: [], status: 'error' });

    const retrying = resolveFavoritesSession({ ...signedIn, isRefetching: true }, failure.failed);
    expect(retrying).toMatchObject({
      userId: undefined,
      error: null,
      failed: true,
      settled: false,
    });
    expect(favoritesSessionSnapshot(stale, retrying)).toMatchObject({
      ids: [],
      pending: [],
      status: 'loading',
    });
    const recovered = resolveFavoritesSession(signedIn, retrying.failed);
    expect(recovered).toMatchObject({ userId: 'fixture-owner', failed: false, settled: true });
  });

  it('waits for successful session refetch before loading and performing a server favorite', async () => {
    const api = backend();
    const store = createFavoritesStore(api);
    let session: unknown = limited;
    let release: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refetch = vi.fn(async () => {
      await pending;
      session = signedIn;
    });
    const retry = refreshFavoritesSession(store, () => session, refetch);
    expect(refetch).toHaveBeenCalledOnce();
    expect(api.list).not.toHaveBeenCalled();
    expect(api.merge).not.toHaveBeenCalled();
    expect(await toggleFavoritesForSession(store, () => session, themeId)).toMatchObject({
      ok: false,
    });
    release();
    await retry;
    expect(store.getSnapshot()).toMatchObject({ accountId: 'fixture-owner', status: 'ready' });
    expect(api.list).toHaveBeenCalledOnce();

    expect(await toggleFavoritesForSession(store, () => session, themeId)).toEqual({
      ok: true,
      data: { favorited: true },
    });
    expect(api.toggle).toHaveBeenCalledExactlyOnceWith(themeId);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('does not assume a void refetch result succeeded when the fresh session remains errored', async () => {
    const api = backend();
    const store = createFavoritesStore(api);
    const refetch = vi.fn(async () => undefined);
    await refreshFavoritesSession(store, () => limited, refetch);
    expect(refetch).toHaveBeenCalledOnce();
    expect(store.getSnapshot().accountId).toBeUndefined();
    expect(api.list).not.toHaveBeenCalled();
    expect(api.merge).not.toHaveBeenCalled();
    expect(api.toggle).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('does not refresh favorites if another session refetch is still in flight', async () => {
    const api = backend();
    const store = createFavoritesStore(api);
    let session: unknown = limited;
    await refreshFavoritesSession(
      store,
      () => session,
      async () => {
        session = { ...signedIn, isRefetching: true };
      },
    );
    expect(api.list).not.toHaveBeenCalled();
    expect(store.getSnapshot().accountId).toBeUndefined();
  });

  it('preserves genuine anonymous local saving after a successful null-session response', async () => {
    const api = backend();
    const store = createFavoritesStore(api);
    let session: unknown = limited;
    await refreshFavoritesSession(
      store,
      () => session,
      async () => {
        session = guest;
      },
    );
    expect(store.getSnapshot()).toMatchObject({ accountId: null, status: 'ready' });
    expect(await toggleFavoritesForSession(store, () => session, themeId)).toEqual({
      ok: true,
      data: { favorited: true },
    });
    expect(readLocalFavorites()).toEqual([themeId]);
    expect(api.toggle).not.toHaveBeenCalled();
    expect(api.list).not.toHaveBeenCalled();
  });

  it('refreshes the existing authenticated store without an unnecessary identity refetch', async () => {
    const api = backend();
    const store = createFavoritesStore(api);
    await store.setAccount('fixture-owner');
    api.list.mockResolvedValueOnce([themeId]);
    const refetch = vi.fn();
    await refreshFavoritesSession(store, () => signedIn, refetch);
    expect(refetch).not.toHaveBeenCalled();
    expect(store.getSnapshot().ids).toEqual([themeId]);
  });

  it('rejects stale click handlers after account identity changes before its effect runs', async () => {
    const api = backend();
    const store = createFavoritesStore(api);
    await store.setAccount('old-owner');
    expect(await toggleFavoritesForSession(store, () => signedIn, themeId)).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(api.toggle).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('fails closed for malformed session snapshots and sanitizes shared error classification', () => {
    expect(resolveFavoritesSession({ data: null, isPending: 'false' })).toMatchObject({
      userId: undefined,
      error: 'NETWORK',
    });
    expect(sessionErrorCode({ status: 429 })).toBe('RATE_LIMITED');
    for (const error of [null, undefined, '429', { status: '429' }, { status: 500 }, new Error()])
      expect(sessionErrorCode(error)).toBe('NETWORK');
  });
});
