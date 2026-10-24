import type { ActionResult, ErrorMessageCode } from './result';

export const FAVORITES_KEY = 'vibeset:favorites';
export const MAX_LOCAL_FAVORITES = 500;
export const MAX_FAVORITES_STORAGE_LENGTH = 32_768;

export type FavoriteToggleData = { favorited: boolean };
export type FavoriteMergeData = { merged: number };
export type FavoritesStatus = 'loading' | 'ready' | 'error';
export interface FavoritesSnapshot {
  accountId: string | null | undefined;
  ids: readonly string[];
  pending: readonly string[];
  status: FavoritesStatus;
  error: ErrorMessageCode | null;
  isSignedIn: boolean;
}
export interface FavoritesContextValue extends Omit<FavoritesSnapshot, 'pending' | 'accountId'> {
  isFavorite: (id: string) => boolean;
  isPending: (id: string) => boolean;
  toggle: (id: string) => Promise<ActionResult<FavoriteToggleData>>;
  refresh: () => Promise<void>;
}
export interface FavoritesBackend {
  list: (signal: AbortSignal) => Promise<string[]>;
  merge: (ids: readonly string[]) => Promise<ActionResult<FavoriteMergeData>>;
  toggle: (id: string) => Promise<ActionResult<FavoriteToggleData>>;
}
export interface FavoritesStore {
  getSnapshot: () => FavoritesSnapshot;
  getServerSnapshot: () => FavoritesSnapshot;
  subscribe: (listener: () => void) => () => void;
  setAccount: (userId: string | null | undefined) => Promise<void>;
  refresh: () => Promise<void>;
  reloadLocal: () => void;
  toggle: (id: string) => Promise<ActionResult<FavoriteToggleData>>;
  dispose: () => void;
}
