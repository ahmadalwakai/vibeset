'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppCatalogError, loadAppCatalog } from '../lib/client/app-catalog';
import type { AppDTO } from '../lib/dto';
import type { ErrorMessageCode } from '../lib/result';

export interface AppCatalogResult {
  apps: readonly AppDTO[];
  loading: boolean;
  error: ErrorMessageCode | null;
  retry: () => void;
}
const empty: readonly AppDTO[] = Object.freeze([]);

export function useAppCatalog(): AppCatalogResult {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<AppCatalogResult, 'retry'>>({
    apps: empty,
    loading: true,
    error: null,
  });
  useEffect(() => {
    const controller = new AbortController();
    void loadAppCatalog(controller.signal).then(
      (apps) => {
        if (!controller.signal.aborted) setState({ apps, loading: false, error: null });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const code =
          typeof navigator !== 'undefined' && !navigator.onLine
            ? 'OFFLINE'
            : error instanceof AppCatalogError
              ? error.code
              : 'NETWORK';
        setState((previous) => ({ ...previous, loading: false, error: code }));
      },
    );
    return () => controller.abort();
  }, [attempt]);
  const retry = useCallback(() => {
    setState((previous) => ({ ...previous, loading: true, error: null }));
    setAttempt((value) => value + 1);
  }, []);
  return { ...state, retry };
}
