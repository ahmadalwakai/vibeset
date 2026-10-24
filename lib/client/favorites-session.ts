import * as z from 'zod/mini';
import type { FavoritesSnapshot, FavoritesStore, FavoriteToggleData } from '../favorites';
import type { ActionResult, ErrorMessageCode } from '../result';
import { favoriteUserIdSchema } from '../validation/favorite-boundaries';
import { sessionErrorCode } from './session-error';

const sessionSchema = z.object({
  data: z.nullable(z.object({ user: z.object({ id: favoriteUserIdSchema }) })),
  isPending: z.boolean(),
  isRefetching: z._default(z.optional(z.boolean()), false),
  error: z.optional(z.unknown()),
});

export interface FavoritesSessionState {
  userId: string | null | undefined;
  error: ErrorMessageCode | null;
  failed: boolean;
  settled: boolean;
}

/** A failed identity lookup is never evidence that the visitor is anonymous. */
export function resolveFavoritesSession(
  input: unknown,
  previousFailure = false,
): FavoritesSessionState {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return { userId: undefined, error: 'NETWORK', failed: true, settled: false };
  const session = parsed.data;
  const error = session.error == null ? null : sessionErrorCode(session.error);
  const failed = error !== null || (previousFailure && (session.isPending || session.isRefetching));
  return {
    userId: session.isPending || failed ? undefined : (session.data?.user.id ?? null),
    error,
    failed,
    settled: !session.isPending && !session.isRefetching && error === null,
  };
}

export function favoritesSessionSnapshot(
  snapshot: FavoritesSnapshot,
  session: FavoritesSessionState,
): FavoritesSnapshot {
  if (session.userId !== undefined && snapshot.accountId === session.userId) return snapshot;
  return {
    ...snapshot,
    accountId: session.userId,
    ids: [],
    pending: [],
    status: session.error ? 'error' : 'loading',
    error: session.error,
    isSignedIn: typeof session.userId === 'string',
  };
}

export async function refreshFavoritesSession(
  store: FavoritesStore,
  readSession: () => unknown,
  refetchSession: () => Promise<void>,
): Promise<void> {
  let session = resolveFavoritesSession(readSession());
  if (session.userId === undefined || !session.settled) {
    await refetchSession();
    // Better Auth refetch resolves void even on failure; inspect its fresh atom,
    // not the React render closure that initiated the retry.
    session = resolveFavoritesSession(readSession());
  }
  if (!session.settled || session.userId === undefined) return;
  if (store.getSnapshot().accountId === session.userId) await store.refresh();
  else await store.setAccount(session.userId);
}

export function toggleFavoritesForSession(
  store: FavoritesStore,
  readSession: () => unknown,
  themeId: string,
): Promise<ActionResult<FavoriteToggleData>> {
  const session = resolveFavoritesSession(readSession());
  if (
    !session.settled ||
    session.userId === undefined ||
    store.getSnapshot().accountId !== session.userId
  )
    return Promise.resolve({
      ok: false,
      error: {
        code: session.error === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'UNAUTHENTICATED',
        message: 'Session identity is unavailable',
      },
    });
  return store.toggle(themeId);
}
