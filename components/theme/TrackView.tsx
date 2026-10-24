'use client';

import { useEffect } from 'react';
import { track } from '@/lib/client/track';
import { observeThemeView } from '@/lib/client/track-view';
import { viewStatisticsPreferenceStore } from '@/lib/client/view-statistics-preference';

const seenThemeViews = new Set<string>();

export function TrackView({ themeId }: { themeId: string }): null {
  useEffect(
    () =>
      observeThemeView(themeId, {
        preference: viewStatisticsPreferenceStore,
        storage: () => window.sessionStorage,
        send: track,
        seen: seenThemeViews,
      }),
    [themeId],
  );
  return null;
}
