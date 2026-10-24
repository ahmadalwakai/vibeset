import * as z from 'zod/mini';
import { blockedCreatorsSchema, publicCreatorHandleSchema } from './creator-blocks';
import type { BlockedCreator } from './creator-blocks';

export const PREFERENCES_KEY = 'vibeset:native-preferences:v1';
export const MAX_FAVORITES = 500;
const MAX_STORED_LENGTH = 65_536;
const uuid = z.uuid().check(z.length(36), z.toLowerCase());
const color = z.string().check(z.regex(/^#[a-f0-9]{6}$/i), z.length(7));
const localeSchema = z.enum(['en', 'ar']);
export const widgetSelectionSchema = z.strictObject({
  id: uuid,
  slug: z.string().check(
    z.minLength(1),
    z.maxLength(160),
    z.regex(/^[a-z0-9][a-z0-9-]*$/),
    z.refine((value) => !/\s/.test(value)),
  ),
  nameEn: z.string().check(z.minLength(1), z.maxLength(500)),
  nameAr: z.nullable(z.string().check(z.maxLength(500))),
  surface: color,
  ink: color,
  accent: color,
  appliedLocale: localeSchema,
  creatorHandle: z._default(z.nullable(publicCreatorHandleSchema), null),
});
export const preferencesSchema = z.strictObject({
  v: z.literal(1),
  locale: localeSchema,
  appearance: z.enum(['system', 'light', 'dark']),
  favoriteIds: z.pipe(
    z.array(uuid).check(z.maxLength(MAX_FAVORITES)),
    z.transform((ids: string[]) => [...new Set(ids)]),
  ),
  widgetSelection: z.nullable(widgetSelectionSchema),
  blockedCreators: z._default(blockedCreatorsSchema, []),
  hiddenThemeIds: z._default(
    z.pipe(
      z.array(uuid).check(z.maxLength(500)),
      z.transform((ids: string[]) => [...new Set(ids)]),
    ),
    [],
  ),
});
export type NativeLocale = z.infer<typeof localeSchema>;
export type WidgetSelection = Readonly<z.infer<typeof widgetSelectionSchema>>;
type Values = z.infer<typeof preferencesSchema>;
export type NativePreferences = Readonly<
  Omit<Values, 'favoriteIds' | 'widgetSelection' | 'blockedCreators' | 'hiddenThemeIds'> & {
    favoriteIds: readonly string[];
    widgetSelection: WidgetSelection | null;
    blockedCreators: readonly BlockedCreator[];
    hiddenThemeIds: readonly string[];
  }
>;
export interface PreferenceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export interface PreferencesSnapshot {
  preferences: NativePreferences;
  loading: boolean;
  saving: boolean;
  issue: 'READ_FAILED' | 'INVALID_STORAGE' | 'WRITE_FAILED' | null;
}
export type PreferencesPatch = Partial<Omit<NativePreferences, 'v'>>;

export class PreferenceReadError extends Error {
  constructor() {
    super('Saved preferences must be read before they can be changed');
    this.name = 'PreferenceReadError';
  }
}

function immutable(value: unknown): NativePreferences {
  const parsed = preferencesSchema.parse(value);
  return Object.freeze({
    ...parsed,
    favoriteIds: Object.freeze([...parsed.favoriteIds]),
    blockedCreators: Object.freeze(parsed.blockedCreators.map((value) => Object.freeze(value))),
    hiddenThemeIds: Object.freeze([...parsed.hiddenThemeIds]),
    widgetSelection: parsed.widgetSelection ? Object.freeze({ ...parsed.widgetSelection }) : null,
  });
}

export const DEFAULT_PREFERENCES = immutable({
  v: 1,
  locale: 'en',
  appearance: 'system',
  favoriteIds: [],
  widgetSelection: null,
});

/** Injected storage keeps validation and write ordering testable without a native bridge. */
export function createPreferencesStore(storage: PreferenceStorage): {
  getSnapshot: () => PreferencesSnapshot;
  subscribe: (listener: () => void) => () => void;
  hydrate: () => Promise<void>;
  requireKnownBaseline: () => Promise<void>;
  update: (
    patch: PreferencesPatch | ((current: NativePreferences) => PreferencesPatch),
  ) => Promise<boolean>;
  retryPersistence: () => Promise<boolean>;
} {
  let snapshot: PreferencesSnapshot = {
    preferences: DEFAULT_PREFERENCES,
    loading: true,
    saving: false,
    issue: null,
  };
  let hydration: Promise<void> | undefined;
  let recovery: Promise<boolean> | undefined;
  let baselineKnown = false;
  let queue = Promise.resolve();
  let revision = 0;
  const listeners = new Set<() => void>();
  const emit = (next: PreferencesSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const readBaseline = async (): Promise<boolean> => {
    let raw: string | null;
    try {
      raw = await storage.getItem(PREFERENCES_KEY);
    } catch {
      emit({ ...snapshot, loading: false, issue: 'READ_FAILED' });
      return false;
    }
    baselineKnown = true;
    if (raw === null) {
      emit({ ...snapshot, loading: false, issue: null });
      return true;
    }
    try {
      if (raw.length > MAX_STORED_LENGTH)
        throw new RangeError('Stored preferences exceed the limit');
      const value: unknown = JSON.parse(raw);
      emit({ preferences: immutable(value), loading: false, saving: false, issue: null });
      return true;
    } catch {
      emit({ ...snapshot, loading: false, issue: 'INVALID_STORAGE' });
      return false;
    }
  };
  const hydrate = (): Promise<void> => (hydration ??= readBaseline().then(() => {}));
  const requireKnownBaseline = async (): Promise<void> => {
    await hydrate();
    if (!baselineKnown) throw new PreferenceReadError();
  };

  const update = async (
    patch: PreferencesPatch | ((current: NativePreferences) => PreferencesPatch),
  ): Promise<boolean> => {
    await requireKnownBaseline();
    const preferences = immutable({
      ...snapshot.preferences,
      ...(typeof patch === 'function' ? patch(snapshot.preferences) : patch),
    });
    const serialized = JSON.stringify(preferences);
    if (serialized.length > MAX_STORED_LENGTH) throw new RangeError('Preferences exceed the limit');
    const ownRevision = ++revision;
    emit({ preferences, loading: false, saving: true, issue: snapshot.issue });
    let saved = false;
    const write = queue.then(async () => {
      try {
        await storage.setItem(PREFERENCES_KEY, serialized);
        saved = true;
        if (ownRevision === revision) emit({ ...snapshot, saving: false, issue: null });
      } catch {
        if (ownRevision === revision) emit({ ...snapshot, saving: false, issue: 'WRITE_FAILED' });
      }
    });
    queue = write;
    await write;
    return saved;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hydrate,
    requireKnownBaseline,
    update,
    retryPersistence: async () => {
      await hydrate();
      // A read failure is not an empty record. Explicit retry reads the existing
      // baseline first; it must never replace unknown saved choices with defaults.
      if (!baselineKnown) {
        recovery ??= readBaseline().finally(() => {
          recovery = undefined;
        });
        return recovery;
      }
      return update({});
    },
  };
}
