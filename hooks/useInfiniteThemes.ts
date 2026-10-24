'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { Paginated, ThemeCardDTO, ThemeListQuery } from '../lib/dto';
import type { ErrorMessageCode } from '../lib/result';
import {
  apiErrorSchema,
  serializeThemeListQuery,
  themeListQuerySchema,
  themePageResponseSchema,
  themeQueryKey,
} from '../lib/validation/themes';
import { infiniteThemesReducer, initialInfiniteThemesState } from './infinite-themes-state';

export interface InfiniteThemesOptions {
  query: ThemeListQuery;
  initialPage: Paginated<ThemeCardDTO>;
}
export interface InfiniteThemesResult {
  items: ThemeCardDTO[];
  nextCursor: string | null;
  hasMore: boolean;
  loading: boolean;
  error: ErrorMessageCode | null;
  loadMore: () => Promise<void>;
  retry: () => Promise<void>;
}

export function useInfiniteThemes({
  query,
  initialPage,
}: InfiniteThemesOptions): InfiniteThemesResult {
  const key = themeQueryKey(query);
  const [stored, dispatch] = useReducer(
    infiniteThemesReducer,
    { key, page: initialPage },
    ({ key: initialKey, page }) => initialInfiniteThemesState(initialKey, page),
  );
  const state = stored.key === key ? stored : initialInfiniteThemesState(key, initialPage);
  const sequence = useRef(0);
  const active = useRef<{ id: number; controller: AbortController } | null>(null);
  useEffect(() => {
    sequence.current += 1;
    active.current?.controller.abort();
    active.current = null;
    dispatch({ type: 'reset', key, page: initialPage });
    return () => {
      sequence.current += 1;
      active.current?.controller.abort();
      active.current = null;
    };
  }, [key, initialPage]);

  const request = useCallback(
    async (retry: boolean): Promise<void> => {
      const cursor = state.nextCursor;
      if (!cursor || state.loading || active.current || (state.error && !retry)) return;
      const id = ++sequence.current;
      const controller = new AbortController();
      active.current = { id, controller };
      dispatch({ type: 'start', key, requestId: id, cursor });
      let code: ErrorMessageCode = 'NETWORK';
      try {
        const response = await fetch(
          `/api/v1/themes?${serializeThemeListQuery({ ...query, cursor })}`,
          { signal: controller.signal, headers: { accept: 'application/json' } },
        );
        code = 'INTERNAL';
        const body: unknown = await response.json();
        if (!response.ok) {
          const parsed = apiErrorSchema.safeParse(body);
          if (parsed.success) code = parsed.data.error.code;
          throw new Error('Theme page request failed');
        }
        const page = themePageResponseSchema.parse(body).data;
        if (page.nextCursor) themeListQuerySchema.parse({ ...query, cursor: page.nextCursor });
        if (sequence.current === id && active.current?.id === id)
          dispatch({ type: 'success', key, requestId: id, cursor, page });
      } catch {
        if (!controller.signal.aborted && sequence.current === id && active.current?.id === id)
          dispatch({
            type: 'failure',
            key,
            requestId: id,
            cursor,
            error: typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : code,
          });
      } finally {
        if (active.current?.id === id) active.current = null;
      }
    },
    [state.nextCursor, state.loading, state.error, key, query, dispatch],
  );
  const loadMore = useCallback((): Promise<void> => request(false), [request]);
  const retry = useCallback((): Promise<void> => request(true), [request]);
  return {
    items: state.items,
    nextCursor: state.nextCursor,
    hasMore: state.nextCursor !== null,
    loading: state.loading,
    error: state.error,
    loadMore,
    retry,
  };
}
