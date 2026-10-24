import {
  MAX_VIEW_STATISTICS_LENGTH,
  VIEW_STATISTICS_KEY,
  viewStatisticsPreferenceSchema,
} from '../validation/view-statistics';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
type Listener = () => void;
export interface ViewStatisticsSnapshot {
  readonly ready: boolean;
  readonly enabled: boolean;
  readonly persistence: 'none' | 'local' | 'tab';
}
export interface ViewStatisticsPreferenceStore {
  getSnapshot: () => ViewStatisticsSnapshot;
  getServerSnapshot: () => ViewStatisticsSnapshot;
  subscribe: (listener: Listener) => () => void;
  setEnabled: (enabled: boolean) => void;
}
interface PreferenceDependencies {
  storage: () => PreferenceStorage | null;
  listen?: (refresh: Listener) => () => void;
}

const serverSnapshot: ViewStatisticsSnapshot = Object.freeze({
  ready: false,
  enabled: false,
  persistence: 'none',
});

function readChoice(raw: string | null): boolean | null {
  if (!raw || raw.length > MAX_VIEW_STATISTICS_LENGTH) return null;
  try {
    const parsed = viewStatisticsPreferenceSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.enabled : null;
  } catch {
    return null;
  }
}

/** Reading a missing/invalid preference never creates a record or enables statistics. */
export function createViewStatisticsPreferenceStore({
  storage,
  listen,
}: PreferenceDependencies): ViewStatisticsPreferenceStore {
  let snapshot = serverSnapshot;
  let failedWrite = false;
  let failedBase: string | null | undefined;
  let stopListening: (() => void) | undefined;
  const listeners = new Set<Listener>();

  function publish(enabled: boolean, persistence: ViewStatisticsSnapshot['persistence']): void {
    if (snapshot.ready && snapshot.enabled === enabled && snapshot.persistence === persistence)
      return;
    snapshot = Object.freeze({ ready: true, enabled, persistence });
    for (const listener of listeners) listener();
  }

  function refresh(external = false): void {
    let raw: string | null;
    try {
      raw = storage()?.getItem(VIEW_STATISTICS_KEY) ?? null;
    } catch {
      if (!failedWrite) publish(false, 'none');
      return;
    }
    const choice = readChoice(raw);
    // Preserve an unsaved choice against an unchanged saved opt-in. Once an external
    // value is readable, off/missing/invalid always overrides a tab-only opt-in.
    if (
      failedWrite &&
      (failedBase === undefined || raw === failedBase) &&
      (!external || choice === true)
    )
      return;
    failedWrite = false;
    publish(choice === true, choice === null ? 'none' : 'local');
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        stopListening = listen?.(() => refresh(true));
        refresh();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopListening?.();
          stopListening = undefined;
        }
      };
    },
    setEnabled: (enabled) => {
      const choice = viewStatisticsPreferenceSchema.parse({ v: 1, enabled });
      let target: PreferenceStorage | null = null;
      try {
        target = storage();
        failedBase = target?.getItem(VIEW_STATISTICS_KEY) ?? null;
      } catch {
        failedBase = undefined;
      }
      try {
        if (!target) throw new Error('Preference storage unavailable');
        target.setItem(VIEW_STATISTICS_KEY, JSON.stringify(choice));
        failedWrite = false;
        publish(choice.enabled, 'local');
      } catch {
        failedWrite = true;
        publish(choice.enabled, 'tab');
      }
    },
  };
}

function browserStorage(): PreferenceStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function listenForStorage(refresh: Listener): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: StorageEvent): void => {
    if (event.key !== VIEW_STATISTICS_KEY && event.key !== null) return;
    try {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
    } catch {
      // A denied store is handled by refresh; never trust an event's stale payload.
    }
    refresh();
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}

export const viewStatisticsPreferenceStore = createViewStatisticsPreferenceStore({
  storage: browserStorage,
  listen: listenForStorage,
});
