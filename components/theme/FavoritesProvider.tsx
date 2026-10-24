'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { authClient } from '@/lib/auth-client';
import { createFavoritesStore } from '@/lib/client/favorites-store';
import {
  favoritesSessionSnapshot,
  refreshFavoritesSession,
  resolveFavoritesSession,
  toggleFavoritesForSession,
} from '@/lib/client/favorites-session';
import { FAVORITES_KEY, type FavoritesContextValue } from '@/lib/favorites';
import {
  favoriteIdsResponseSchema,
  favoriteMergeResultSchema,
  favoriteToggleResultSchema,
} from '@/lib/validation/favorite-boundaries';
import { mergeLocalFavorites, toggleFavorite } from '@/server/actions/favorites';

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

function readSession(): unknown {
  return authClient.$store.atoms.session?.get();
}

export function FavoritesProvider({ children }: { children: ReactNode }): ReactElement {
  const session = authClient.useSession();
  const [previousFailure, setPreviousFailure] = useState(false);
  const identity = resolveFavoritesSession(session, previousFailure);
  if (identity.failed !== previousFailure) setPreviousFailure(identity.failed);
  const userId = identity.userId;
  const [store] = useState(() =>
    createFavoritesStore({
      list: async (signal) => {
        const response = await fetch('/api/me/favorites', {
          signal,
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
        });
        if (!response.ok) throw new Error('Favorites request failed');
        const value: unknown = await response.json();
        return favoriteIdsResponseSchema.parse(value).data.themeIds;
      },
      merge: async (themeIds) =>
        favoriteMergeResultSchema.parse(await mergeLocalFavorites({ themeIds })),
      toggle: async (themeId) =>
        favoriteToggleResultSchema.parse(await toggleFavorite({ themeId })),
    }),
  );
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const current = favoritesSessionSnapshot(snapshot, identity);
  useEffect(() => {
    void store.setAccount(userId);
  }, [store, userId]);
  useEffect(() => {
    const storage = (event: StorageEvent): void => {
      if (event.key === FAVORITES_KEY || event.key === null) store.reloadLocal();
    };
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('storage', storage);
      store.dispose();
    };
  }, [store]);
  const value = useMemo<FavoritesContextValue>(
    () => ({
      ids: current.ids,
      status: current.status,
      error: current.error,
      isSignedIn: current.isSignedIn,
      isFavorite: (id) => current.ids.includes(id.toLowerCase()),
      isPending: (id) => current.pending.includes(id.toLowerCase()),
      toggle: (id) => toggleFavoritesForSession(store, readSession, id),
      refresh: () => refreshFavoritesSession(store, readSession, session.refetch),
    }),
    [current, store, session.refetch],
  );
  return <FavoritesContext value={value}>{children}</FavoritesContext>;
}

export function useFavorites(): FavoritesContextValue {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error('FavoritesProvider is required');
  return value;
}
