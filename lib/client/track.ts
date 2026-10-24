import { trackInputSchema } from '../validation/track';
import type { TrackEvent } from '../validation/track';

/** Best-effort event counts without account credentials; failures never interrupt navigation. */
export function track(themeId: string, event: TrackEvent, signal?: AbortSignal): void {
  const input = trackInputSchema.safeParse({ themeId, event });
  if (!input.success || typeof window === 'undefined' || signal?.aborted) return;
  try {
    void fetch('/api/track', {
      method: 'POST',
      credentials: 'omit',
      mode: 'same-origin',
      keepalive: true,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.data),
      ...(signal ? { signal } : {}),
    }).catch(() => {});
  } catch {
    /* Some browsers reject keepalive synchronously while unloading. */
  }
}
