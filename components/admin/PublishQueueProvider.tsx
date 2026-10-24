'use client';

import { Skeleton } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { z } from 'zod';
import { ErrorState } from '@/components/common/ErrorState';
import { toaster } from '@/components/ui/toaster';
import { authClient } from '@/lib/auth-client';
import { sessionErrorCode } from '@/lib/client/session-error';
import {
  nextPublishJobs,
  publishQueueBusy,
  publishQueueReducer,
  reviewDecisionReducer,
} from '@/lib/admin-workflow';
import type {
  PublishJob,
  PublishQueueInput,
  ReviewDecisionState,
  ReviewDecisionTarget,
  ReviewQueueInput,
} from '@/lib/admin-workflow';
import type { ErrorMessageCode } from '@/lib/result';
import { themeIdSchema } from '@/lib/theme-status';
import { apiErrorSchema } from '@/lib/validation/themes';
import { adminTransitionThemes } from '@/server/actions/admin/themes';

interface PublishQueueContextValue {
  items: readonly PublishJob[];
  paused: boolean;
  enqueue: (items: readonly PublishQueueInput[], options?: { force?: boolean }) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  retry: (id?: string) => void;
  clearFinished: () => void;
  review: ReviewDecisionState;
  stageReview: (input: {
    theme: ReviewQueueInput;
    to: ReviewDecisionTarget;
    reason?: string;
    publish: boolean;
  }) => void;
  undoReview: () => void;
  retryReview: (key: string) => void;
}
const QueueContext = createContext<PublishQueueContextValue | null>(null);
const responseSchema = z.object({
  data: z.object({ assetVersion: z.number().int().nonnegative(), skipped: z.boolean() }),
});

export function PublishQueueProvider({
  ownerId,
  children,
}: {
  ownerId: string;
  children: ReactNode;
}): ReactElement {
  const session = authClient.useSession();
  if (session.isPending) return <Skeleton h="96" rounded="card" />;
  if (!session.data && session.error)
    return (
      <ErrorState
        code={sessionErrorCode(session.error)}
        onRetry={() => void session.refetch()}
        retrying={session.isRefetching}
      />
    );
  if (session.data?.user.id !== ownerId || session.data.user.role !== 'admin')
    return <ErrorState code="UNAUTHENTICATED" />;
  return <QueueProvider key={ownerId}>{children}</QueueProvider>;
}

function QueueProvider({ children }: { children: ReactNode }): ReactElement {
  const errors = useTranslations('errors');
  const [state, dispatch] = useReducer(publishQueueReducer, { items: [], paused: false });
  const [review, reviewDispatch] = useReducer(reviewDecisionReducer, { decisions: [] });
  const sending = useRef(new Set<string>());
  const requests = useRef(new Map<string, AbortController>());
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const active = requests.current;
    return () => {
      mounted.current = false;
      for (const request of active.values()) request.abort();
      active.clear();
    };
  }, []);
  useEffect(() => {
    for (const item of nextPublishJobs(state, requests.current.size)) {
      if (requests.current.has(item.id)) continue;
      const controller = new AbortController();
      requests.current.set(item.id, controller);
      dispatch({ type: 'start', id: item.id });
      void (async (): Promise<void> => {
        try {
          const response = await fetch(`/api/admin/themes/${encodeURIComponent(item.id)}/publish`, {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: item.force }),
            signal: controller.signal,
          });
          const value: unknown = await response.json();
          if (!mounted.current || controller.signal.aborted) return;
          if (!response.ok) {
            const error = apiErrorSchema.safeParse(value);
            dispatch({
              type: 'finish',
              id: item.id,
              status: 'failed',
              error: error.success ? error.data.error.code : 'INTERNAL',
            });
            return;
          }
          const data = responseSchema.safeParse(value);
          dispatch(
            data.success
              ? { type: 'finish', id: item.id, status: data.data.data.skipped ? 'skipped' : 'done' }
              : { type: 'finish', id: item.id, status: 'failed', error: 'INTERNAL' },
          );
        } catch {
          if (mounted.current && !controller.signal.aborted) {
            const error: ErrorMessageCode =
              typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'NETWORK';
            dispatch({ type: 'finish', id: item.id, status: 'failed', error });
          }
        } finally {
          if (requests.current.get(item.id) === controller) requests.current.delete(item.id);
        }
      })();
    }
  }, [state]);
  useEffect(() => {
    const next = review.decisions
      .filter((item) => item.status === 'pending')
      .sort((a, b) => a.deadline - b.deadline)[0];
    if (!next) return;
    const timer = setTimeout(
      () => {
        const now = Date.now();
        for (const decision of review.decisions) {
          if (
            decision.status !== 'pending' ||
            decision.deadline > now ||
            sending.current.has(decision.key)
          )
            continue;
          sending.current.add(decision.key);
          reviewDispatch({ type: 'start', key: decision.key, now });
          void adminTransitionThemes({
            ids: [decision.id],
            reviewVersion: decision.reviewVersion,
            to: decision.to,
            ...(decision.reason ? { reason: decision.reason } : {}),
          })
            .then((result) => {
              if (!mounted.current) return;
              const row = result.ok
                ? result.data.results.find((item) => item.id === decision.id)
                : undefined;
              const error = result.ok
                ? row?.ok
                  ? null
                  : (row?.code ?? 'INTERNAL')
                : result.error.code;
              reviewDispatch({ type: 'finish', key: decision.key, error });
              if (error) toaster.create({ type: 'error', title: errors(error) });
              else if (decision.publish)
                dispatch({ type: 'enqueue', items: [decision], force: false });
            })
            .catch(() => {
              if (mounted.current) {
                reviewDispatch({ type: 'finish', key: decision.key, error: 'NETWORK' });
                toaster.create({ type: 'error', title: errors('NETWORK') });
              }
            })
            .finally(() => sending.current.delete(decision.key));
        }
      },
      Math.max(0, next.deadline - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [review, errors]);
  const busy =
    publishQueueBusy(state) ||
    review.decisions.some((item) => item.status === 'pending' || item.status === 'sending');
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);
  const enqueue = useCallback(
    (items: readonly PublishQueueInput[], options?: { force?: boolean }): void => {
      if (!mounted.current) return;
      const parsed = items.flatMap((item) => {
        const id = themeIdSchema.safeParse(item.id);
        return id.success ? [{ ...item, id: id.data }] : [];
      });
      dispatch({ type: 'enqueue', items: parsed, force: options?.force === true });
    },
    [],
  );
  const cancel = useCallback((): void => {
    for (const controller of requests.current.values()) controller.abort();
    requests.current.clear();
    dispatch({ type: 'cancel' });
  }, []);
  const stageReview = useCallback(
    (input: {
      theme: ReviewQueueInput;
      to: ReviewDecisionTarget;
      reason?: string;
      publish: boolean;
    }): void => {
      if (!mounted.current) return;
      const id = themeIdSchema.safeParse(input.theme.id);
      if (!id.success) return;
      reviewDispatch({
        type: 'stage',
        ...input.theme,
        id: id.data,
        to: input.to,
        reason: input.reason,
        publish: input.publish,
        now: Date.now(),
      });
    },
    [],
  );
  const undoReview = useCallback((): void => reviewDispatch({ type: 'undo', now: Date.now() }), []);
  const retryReview = useCallback(
    (key: string): void => reviewDispatch({ type: 'retry', key, now: Date.now() }),
    [],
  );
  const value = useMemo<PublishQueueContextValue>(
    () => ({
      items: state.items,
      paused: state.paused,
      enqueue,
      cancel,
      pause: (): void => dispatch({ type: 'pause' }),
      resume: (): void => dispatch({ type: 'resume' }),
      retry: (id?: string): void => dispatch({ type: 'retry', id }),
      clearFinished: (): void => dispatch({ type: 'clearFinished' }),
      review,
      stageReview,
      undoReview,
      retryReview,
    }),
    [state.items, state.paused, enqueue, cancel, review, stageReview, undoReview, retryReview],
  );
  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

export function usePublishQueue(): PublishQueueContextValue {
  const value = useContext(QueueContext);
  if (!value) throw new Error('Publish queue must be inside PublishQueueProvider');
  return value;
}
