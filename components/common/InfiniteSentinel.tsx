'use client';

import { Box, Button, Skeleton, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ReactElement } from 'react';

export type InfiniteSentinelProps = {
  hasMore: boolean;
  enabled?: boolean;
  onError?: () => void;
} & (
  | { onLoadMore: () => Promise<void>; loading?: boolean }
  | { onLoadMore: () => void; loading: boolean }
);

export function InfiniteSentinel({
  onLoadMore,
  hasMore,
  loading = false,
  enabled = true,
  onError,
}: InfiniteSentinelProps): ReactElement {
  const t = useTranslations('common');
  const element = useRef<HTMLDivElement>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const errorHandler = useRef(onError);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = loading || pending;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    errorHandler.current = onError;
  }, [onError]);

  function loadMore(): void {
    if (!enabled || busy || !hasMore || inFlight.current) return;
    const node = element.current;
    inFlight.current = true;
    setFailed(false);

    function finishFailure(): void {
      inFlight.current = false;
      if (!mounted.current) return;
      setPending(false);
      setFailed(true);
      errorHandler.current?.();
    }

    try {
      const request = onLoadMore();
      if (request && typeof request.then === 'function') {
        setPending(true);
        if (node) observer.current?.unobserve(node);
        void request.then(() => {
          inFlight.current = false;
          if (!mounted.current) return;
          setPending(false);
          if (node && observer.current) {
            observer.current.unobserve(node);
            observer.current.observe(node);
          }
        }, finishFailure);
      } else {
        // Void callbacks remain observable; their parent supplies the in-flight loading state.
        inFlight.current = false;
      }
    } catch {
      finishFailure();
    }
  }

  const intersect = useEffectEvent(() => {
    if (!failed) loadMore();
  });

  useEffect(() => {
    const node = element.current;
    if (
      !node ||
      !enabled ||
      busy ||
      failed ||
      !hasMore ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const current = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) intersect();
      },
      { rootMargin: '800px' },
    );
    observer.current = current;
    current.observe(node);
    return () => {
      current.disconnect();
      if (observer.current === current) observer.current = null;
    };
  }, [enabled, busy, failed, hasMore]);

  return (
    <Box ref={element} py="6" aria-busy={busy}>
      <Stack gap="3" align="center">
        <Text role="status" aria-live="polite" textStyle="body.sm" color="fg.muted">
          {busy ? t('loadingMore') : !hasMore ? t('endOfList') : null}
        </Text>
        {busy ? <Skeleton h="2" w="24" /> : null}
        {enabled && hasMore ? (
          <Button
            variant="outline"
            colorPalette="brand"
            size="lg"
            loading={busy}
            onClick={loadMore}
          >
            {failed ? t('retry') : t('loadMore')}
          </Button>
        ) : null}
      </Stack>
    </Box>
  );
}
