'use client';

import { useEffect } from 'react';
import { z } from 'zod';
import { track } from '@/lib/client/track';

const recordedSchema = z.literal('1');
const seenThemeViews = new Set<string>();
type ViewStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Storage may be unavailable in private or embedded browsers; memory still deduplicates remounts. */
export function trackViewOnce(
  themeId: string,
  storage: ViewStorage | null,
  send: (themeId: string, event: 'view') => void,
  seen: Set<string>,
): void {
  if (seen.has(themeId)) return;
  const key = `vibeset:viewed:${themeId}`;
  try {
    if (recordedSchema.safeParse(storage?.getItem(key)).success) {
      seen.add(themeId);
      return;
    }
    storage?.setItem(key, '1');
  } catch {
    // A blocked session store must not prevent a visit or cause repeated tracking on remount.
  }
  seen.add(themeId);
  send(themeId, 'view');
}

export function TrackView({ themeId }: { themeId: string }): null {
  useEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      // In-app and privacy modes may deny even accessing the Storage object.
    }
    trackViewOnce(themeId, storage, track, seenThemeViews);
  }, [themeId]);
  return null;
}
