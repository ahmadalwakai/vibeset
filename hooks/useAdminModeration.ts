'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { ActionResult, ErrorMessageCode } from '@/lib/result';

interface AdminModerationState<T> {
  detail: T | null;
  loading: boolean;
  pending: boolean;
  error: ErrorMessageCode | null;
  saved: boolean;
  retry: () => void;
  run: (request: () => Promise<ActionResult<unknown>>) => Promise<boolean>;
}
/** Drawer is keyed by entity id; request epochs also protect refreshes and unmounts. */
export function useAdminModeration<T>(
  read: () => Promise<ActionResult<T | null>>,
): AdminModerationState<T> {
  const [detail, setDetail] = useState<T | null>(null),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorMessageCode | null>(null),
    [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false),
    [navigating, startTransition] = useTransition();
  const router = useRouter(),
    latestRead = useRef(read),
    alive = useRef(false),
    epoch = useRef(0),
    running = useRef(false);
  useEffect(() => {
    latestRead.current = read;
  }, [read]);
  const invalidate = useCallback((): void => {
    epoch.current++;
  }, []);
  const load = useCallback(async (): Promise<void> => {
    const request = ++epoch.current;
    setLoading(true);
    setError(null);
    try {
      const result = await latestRead.current();
      if (!alive.current || epoch.current !== request) return;
      if (result.ok) setDetail(result.data);
      else {
        setDetail(null);
        setError(result.error.code);
      }
    } catch {
      if (alive.current && epoch.current === request) {
        setDetail(null);
        setError('NETWORK');
      }
    } finally {
      if (alive.current && epoch.current === request) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    alive.current = true;
    void Promise.resolve().then(() => {
      if (active) return load();
    });
    return () => {
      active = false;
      alive.current = false;
      invalidate();
    };
  }, [load, invalidate]);
  const run = useCallback(
    async (request: () => Promise<ActionResult<unknown>>): Promise<boolean> => {
      if (running.current || !alive.current) return false;
      running.current = true;
      setBusy(true);
      setError(null);
      setSaved(false);
      try {
        const result = await request();
        if (!alive.current) return false;
        if (!result.ok) {
          setError(result.error.code);
          return false;
        }
        setSaved(true);
        await load();
        if (!alive.current) return false;
        startTransition(() => router.refresh());
        return true;
      } catch {
        if (alive.current) setError('NETWORK');
        return false;
      } finally {
        running.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [load, router],
  );
  return {
    detail,
    loading,
    pending: busy || navigating || loading,
    error,
    saved,
    retry: () => {
      void load();
    },
    run,
  };
}
