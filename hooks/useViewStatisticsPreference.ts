'use client';

import { useSyncExternalStore } from 'react';
import { viewStatisticsPreferenceStore } from '@/lib/client/view-statistics-preference';
import type { ViewStatisticsSnapshot } from '@/lib/client/view-statistics-preference';

export function useViewStatisticsPreference(): ViewStatisticsSnapshot & {
  setEnabled: (enabled: boolean) => void;
} {
  const snapshot = useSyncExternalStore(
    viewStatisticsPreferenceStore.subscribe,
    viewStatisticsPreferenceStore.getSnapshot,
    viewStatisticsPreferenceStore.getServerSnapshot,
  );
  return { ...snapshot, setEnabled: viewStatisticsPreferenceStore.setEnabled };
}
