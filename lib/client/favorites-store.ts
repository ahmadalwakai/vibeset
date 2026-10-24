import {
  MAX_LOCAL_FAVORITES,
  type FavoritesBackend,
  type FavoritesSnapshot,
  type FavoritesStore,
  type FavoriteToggleData,
} from '../favorites';
import type { ActionResult, ErrorCode, ErrorMessageCode } from '../result';
import { favoriteIdsSchema, favoriteThemeIdSchema } from '../validation/favorite-boundaries';
import {
  readLocalFavorites,
  removeMergedLocalFavorites,
  writeLocalFavorites,
} from './favorites-storage';

const initial: FavoritesSnapshot = {
  accountId: undefined,
  ids: [],
  pending: [],
  status: 'loading',
  error: null,
  isSignedIn: false,
};

function failure(code: ErrorCode): ActionResult<FavoriteToggleData> {
  return { ok: false, error: { code, message: 'Favorites could not be updated' } };
}
function replaceId(ids: readonly string[], id: string, included: boolean): string[] {
  return included
    ? ids.includes(id)
      ? [...ids]
      : [id, ...ids]
    : ids.filter((value) => value !== id);
}

/** Framework-free store so session changes, failed mutations, and merges have one ordering policy. */
export function createFavoritesStore(backend: FavoritesBackend): FavoritesStore {
  let snapshot = initial;
  let account: string | null | undefined;
  let initialized = false;
  let epoch = 0;
  let loadId = 0;
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();
  const requests = new Map<string, Promise<ActionResult<FavoriteToggleData>>>();
  const emit = (next: FavoritesSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const networkError = (): ErrorMessageCode =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'OFFLINE' : 'NETWORK';

  const refresh = async (): Promise<void> => {
    if (account === undefined) return;
    if (account === null) {
      emit({
        accountId: null,
        ids: readLocalFavorites(),
        pending: [],
        status: 'ready',
        error: null,
        isSignedIn: false,
      });
      return;
    }
    const currentEpoch = epoch;
    // Block new toggles synchronously, before yielding to existing requests.
    emit({ ...snapshot, status: 'loading', error: null, isSignedIn: true });
    // A refresh cannot replace optimistic state with a snapshot taken before its mutation.
    await Promise.all([...requests.values()]);
    if (epoch !== currentEpoch) return;
    const id = ++loadId;
    controller?.abort();
    const active = new AbortController();
    controller = active;
    const current = (): boolean =>
      epoch === currentEpoch && loadId === id && !active.signal.aborted;
    emit({ ...snapshot, pending: [], status: 'loading', error: null, isSignedIn: true });
    try {
      const local = readLocalFavorites();
      if (local.length) {
        const merged = await backend.merge(local);
        if (!current()) return;
        if (!merged.ok) {
          emit({ ...snapshot, status: 'error', error: merged.error.code });
          return;
        }
        removeMergedLocalFavorites(local);
      }
      const ids = favoriteIdsSchema.parse(await backend.list(active.signal));
      if (current())
        emit({
          accountId: account,
          ids,
          pending: [],
          status: 'ready',
          error: null,
          isSignedIn: true,
        });
    } catch {
      if (current()) emit({ ...snapshot, status: 'error', error: networkError() });
    } finally {
      if (controller === active) controller = null;
    }
  };

  const setAccount = async (userId: string | null | undefined): Promise<void> => {
    if (initialized && account === userId) return;
    initialized = true;
    account = userId;
    epoch += 1;
    loadId += 1;
    controller?.abort();
    controller = null;
    requests.clear();
    emit({ ...initial, accountId: userId, isSignedIn: typeof userId === 'string' });
    await refresh();
  };

  const toggle = (raw: string): Promise<ActionResult<FavoriteToggleData>> => {
    const parsed = favoriteThemeIdSchema.safeParse(raw);
    if (!parsed.success) return Promise.resolve(failure('VALIDATION'));
    const id = parsed.data;
    const pending = requests.get(id);
    if (pending) return pending;
    if (snapshot.status !== 'ready') return Promise.resolve(failure('CONFLICT'));
    const before = snapshot.ids.includes(id);
    if (account === null) {
      if (!before && snapshot.ids.length >= MAX_LOCAL_FAVORITES)
        return Promise.resolve(failure('VALIDATION'));
      const ids = replaceId(snapshot.ids, id, !before);
      writeLocalFavorites(ids);
      emit({ ...snapshot, ids });
      return Promise.resolve({ ok: true, data: { favorited: !before } });
    }
    if (account === undefined) return Promise.resolve(failure('UNAUTHENTICATED'));
    const currentEpoch = epoch;
    emit({
      ...snapshot,
      ids: replaceId(snapshot.ids, id, !before),
      pending: [...snapshot.pending, id],
    });
    const request = (async (): Promise<ActionResult<FavoriteToggleData>> => {
      let result: ActionResult<FavoriteToggleData>;
      try {
        result = await backend.toggle(id);
      } catch {
        result = failure('INTERNAL');
      }
      if (currentEpoch === epoch) {
        emit({
          ...snapshot,
          ids: replaceId(snapshot.ids, id, result.ok ? result.data.favorited : before),
          pending: snapshot.pending.filter((value) => value !== id),
        });
      }
      return result;
    })();
    requests.set(id, request);
    void request.finally(() => {
      if (requests.get(id) === request) requests.delete(id);
    });
    return request;
  };

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAccount,
    refresh,
    reloadLocal: (): void => {
      if (account === null) void refresh();
    },
    toggle,
    dispose: (): void => {
      epoch += 1;
      loadId += 1;
      initialized = false;
      account = undefined;
      controller?.abort();
      controller = null;
      requests.clear();
    },
  };
}
