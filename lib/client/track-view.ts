import { z } from 'zod';
import { trackInputSchema } from '../validation/track';
import type { ViewStatisticsPreferenceStore } from './view-statistics-preference';

type ViewStorage = Pick<Storage, 'getItem' | 'setItem'>;
type SendView = (themeId: string, event: 'view', signal: AbortSignal) => void;
interface ViewDependencies {
  preference: ViewStatisticsPreferenceStore;
  storage: () => ViewStorage | null;
  send: SendView;
  seen: Set<string>;
}
const recordedSchema = z.literal('1');

export function trackViewOnce(
  themeId: string,
  dependencies: ViewDependencies,
  signal: AbortSignal,
): void {
  const { preference, storage, send, seen } = dependencies;
  const active = (): boolean => !signal.aborted && preference.getSnapshot().enabled;
  if (!active()) return;
  const input = trackInputSchema.safeParse({ themeId, event: 'view' });
  if (!input.success || seen.has(input.data.themeId)) return;
  const id = input.data.themeId;
  try {
    const target = storage();
    if (!active()) return;
    if (recordedSchema.safeParse(target?.getItem(`vibeset:viewed:${id}`)).success) {
      if (active()) seen.add(id);
      return;
    }
    if (!active()) return;
    target?.setItem(`vibeset:viewed:${id}`, '1');
  } catch {
    // Denied session storage still permits an explicitly enabled, tab-deduplicated view.
  }
  if (!active()) return;
  seen.add(id);
  send(id, 'view', signal);
}

/** No marker access or transport occurs until the live preference is explicitly enabled. */
export function observeThemeView(themeId: string, dependencies: ViewDependencies): () => void {
  let controller: AbortController | null = null;
  const update = (): void => {
    const current = dependencies.preference.getSnapshot();
    if (!current.ready || !current.enabled) {
      controller?.abort();
      controller = null;
      return;
    }
    controller ??= new AbortController();
    trackViewOnce(themeId, dependencies, controller.signal);
  };
  const unsubscribe = dependencies.preference.subscribe(update);
  update();
  return () => {
    unsubscribe();
    controller?.abort();
  };
}
