import { describe, expect, it, vi } from 'vitest';
import {
  createPreferencesStore,
  DEFAULT_PREFERENCES,
  MAX_FAVORITES,
  PREFERENCES_KEY,
  preferencesSchema,
  PreferenceReadError,
} from '../lib/preferences';
import { thumbnailReducer } from '../components/thumbnail-state';
import en from '../messages/en.json';
import ar from '../messages/ar.json';

const id = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
function memory(raw: string | null = null): {
  getItem: ReturnType<typeof vi.fn<() => Promise<string | null>>>;
  setItem: ReturnType<typeof vi.fn<(key: string, value: string) => Promise<void>>>;
  read: () => string | null;
} {
  let stored = raw;
  return {
    getItem: vi.fn(async () => stored),
    setItem: vi.fn(async (_key, value) => {
      stored = value;
    }),
    read: () => stored,
  };
}
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('native preferences boundary and persistence', () => {
  it('starts without storage writes and hydrates only once without creating a preference', async () => {
    const storage = memory();
    const store = createPreferencesStore(storage);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(store.getSnapshot().loading).toBe(true);
    await Promise.all([store.hydrate(), store.hydrate()]);
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(PREFERENCES_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toMatchObject({
      preferences: DEFAULT_PREFERENCES,
      loading: false,
      issue: null,
    });
  });
  it('normalizes favorite UUIDs and deduplicates in first-occurrence order before persistence', async () => {
    const storage = memory();
    const store = createPreferencesStore(storage);
    await store.update({ locale: 'ar', appearance: 'dark', favoriteIds: [id.toUpperCase(), id] });
    expect(store.getSnapshot().preferences).toMatchObject({
      locale: 'ar',
      appearance: 'dark',
      favoriteIds: [id],
    });
    const restored = createPreferencesStore(storage);
    await restored.hydrate();
    expect(restored.getSnapshot().preferences).toEqual(store.getSnapshot().preferences);
  });
  it.each([
    { ...DEFAULT_PREFERENCES, v: 2 },
    { ...DEFAULT_PREFERENCES, locale: 'fr' },
    { ...DEFAULT_PREFERENCES, appearance: 'auto' },
    { ...DEFAULT_PREFERENCES, favoriteIds: [`${id}\n`] },
    { ...DEFAULT_PREFERENCES, favoriteIds: Array(MAX_FAVORITES + 1).fill(id) },
    { ...DEFAULT_PREFERENCES, accessToken: 'not-a-preference' },
    { ...DEFAULT_PREFERENCES, widgetSelection: { id } },
  ])('rejects corrupt, foreign or oversized preference values %#', (value) => {
    expect(preferencesSchema.safeParse(value).success).toBe(false);
  });
  it.each(['{', 'x'.repeat(65_537), JSON.stringify({ v: 1 })])(
    'fails closed on unreadable stored data %#',
    async (raw) => {
      const storage = memory(raw);
      const store = createPreferencesStore(storage);
      await store.hydrate();
      expect(store.getSnapshot()).toMatchObject({
        preferences: DEFAULT_PREFERENCES,
        loading: false,
        issue: 'INVALID_STORAGE',
      });
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );
  it('keeps user choices in memory after a denied write and supports explicit recovery', async () => {
    const storage = memory();
    storage.setItem.mockRejectedValueOnce(new Error('storage unavailable'));
    const store = createPreferencesStore(storage);
    expect(await store.update({ locale: 'ar', favoriteIds: [id] })).toBe(false);
    expect(store.getSnapshot()).toMatchObject({
      preferences: { locale: 'ar', favoriteIds: [id] },
      issue: 'WRITE_FAILED',
      saving: false,
    });
    expect(await store.retryPersistence()).toBe(true);
    expect(store.getSnapshot().issue).toBeNull();
    expect(JSON.parse(storage.read() ?? '{}')).toMatchObject({ locale: 'ar', favoriteIds: [id] });
  });
  it('blocks mutations after a failed initial read and recovers the actual baseline before any write', async () => {
    const previous = { ...DEFAULT_PREFERENCES, locale: 'ar', favoriteIds: [id] };
    const storage = memory(JSON.stringify(previous));
    storage.getItem.mockRejectedValueOnce(new Error('read denied'));
    const store = createPreferencesStore(storage);
    await store.hydrate();
    expect(store.getSnapshot().issue).toBe('READ_FAILED');
    await expect(store.requireKnownBaseline()).rejects.toBeInstanceOf(PreferenceReadError);
    await expect(store.update({ appearance: 'dark' })).rejects.toBeInstanceOf(PreferenceReadError);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(JSON.parse(storage.read() ?? '{}')).toEqual(previous);
    expect(await store.retryPersistence()).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.getSnapshot().preferences).toEqual(previous);
    await store.update({ appearance: 'dark' });
    expect(store.getSnapshot()).toMatchObject({
      preferences: { appearance: 'dark', locale: 'ar', favoriteIds: [id] },
      issue: null,
    });
    expect(JSON.parse(storage.read() ?? '{}')).toMatchObject({
      locale: 'ar',
      favoriteIds: [id],
      appearance: 'dark',
    });
  });
  it('never writes defaults while an explicit read recovery still fails', async () => {
    const storage = memory(JSON.stringify({ ...DEFAULT_PREFERENCES, favoriteIds: [id] }));
    storage.getItem.mockRejectedValue(new Error('read denied'));
    const store = createPreferencesStore(storage);
    await store.hydrate();
    expect(await store.retryPersistence()).toBe(false);
    await expect(
      store.update((current) => ({ favoriteIds: [...current.favoriteIds, id] })),
    ).rejects.toBeInstanceOf(PreferenceReadError);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.getSnapshot().issue).toBe('READ_FAILED');
    expect(JSON.parse(storage.read() ?? '{}').favoriteIds).toEqual([id]);
  });
  it('serializes overlapping writes and never replaces a newer preference with an older completion', async () => {
    const storage = memory();
    const first = deferred();
    storage.setItem.mockImplementationOnce(async () => {
      await first.promise;
    });
    const store = createPreferencesStore(storage);
    await store.hydrate();
    const older = store.update({ locale: 'ar' });
    await Promise.resolve();
    const newer = store.update({ appearance: 'dark' });
    await vi.waitFor(() =>
      expect(store.getSnapshot().preferences).toMatchObject({ locale: 'ar', appearance: 'dark' }),
    );
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    first.resolve();
    await Promise.all([older, newer]);
    expect(JSON.parse(storage.read() ?? '{}')).toMatchObject({ locale: 'ar', appearance: 'dark' });
    expect(store.getSnapshot().saving).toBe(false);
  });
  it('uses the latest snapshot for functional updates and exposes immutable stored arrays', async () => {
    const store = createPreferencesStore(memory());
    await Promise.all([
      store.update({ favoriteIds: [id] }),
      store.update((value) => ({ favoriteIds: value.favoriteIds.filter((entry) => entry !== id) })),
    ]);
    expect(store.getSnapshot().preferences.favoriteIds).toEqual([]);
    expect(Object.isFrozen(store.getSnapshot().preferences.favoriteIds)).toBe(true);
  });
  it('persists only a validated applied widget summary and clears it explicitly', async () => {
    const storage = memory();
    const store = createPreferencesStore(storage);
    const selection = {
      id,
      slug: 'native-calendar',
      nameEn: 'Calendar',
      nameAr: 'تقويم',
      surface: '#ffffff',
      ink: '#16121d',
      accent: '#9734b1',
      appliedLocale: 'ar' as const,
      creatorHandle: null,
    };
    await store.update({ widgetSelection: selection });
    expect(store.getSnapshot().preferences.widgetSelection).toEqual(selection);
    await store.update({ widgetSelection: null });
    expect(store.getSnapshot().preferences.widgetSelection).toBeNull();
  });
  it('keeps native dictionaries structurally equivalent, including widget and startup keys', () => {
    function keys(value: object, prefix = ''): string[] {
      return Object.entries(value)
        .flatMap(([key, child]) =>
          typeof child === 'object' && child !== null
            ? keys(child, `${prefix}${key}.`)
            : [`${prefix}${key}`],
        )
        .sort();
    }
    expect(keys(en)).toEqual(keys(ar));
    expect(en.widgets.native.emptyTitle).toBeTruthy();
    expect(ar.startup.retry).toBeTruthy();
  });
});

describe('native thumbnail recovery', () => {
  it('retries a changed published URL and ignores a late error from the old asset', () => {
    const oldUrl = 'https://cdn.example.invalid/themes/old/thumb.webp';
    const newUrl = 'https://cdn.example.invalid/themes/new/thumb.webp';
    let state = thumbnailReducer({ url: oldUrl, failed: false }, { kind: 'failure', url: oldUrl });
    expect(state.failed).toBe(true);
    state = thumbnailReducer(state, { kind: 'source', url: newUrl });
    expect(state).toEqual({ url: newUrl, failed: false });
    state = thumbnailReducer(state, { kind: 'failure', url: oldUrl });
    expect(state).toEqual({ url: newUrl, failed: false });
    state = thumbnailReducer(state, { kind: 'failure', url: newUrl });
    expect(state.failed).toBe(true);
    expect(thumbnailReducer(state, { kind: 'source', url: newUrl }).failed).toBe(true);
  });
});
