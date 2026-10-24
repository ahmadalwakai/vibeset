import { trackInputSchema } from '../validation/track';
import type { TrackEvent } from '../validation/track';

/** Best-effort anonymous analytics; failures never interrupt saving or navigation. */
export function track(themeId: string, event: TrackEvent): void {
  const input = trackInputSchema.safeParse({ themeId, event });
  if (!input.success || typeof window === 'undefined') return;
  try {
    void fetch('/api/track', {
      method: 'POST',
      credentials: 'omit',
      mode: 'same-origin',
      keepalive: true,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.data),
    }).catch(() => {});
  } catch {
    /* Some browsers reject keepalive synchronously while unloading. */
  }
}
