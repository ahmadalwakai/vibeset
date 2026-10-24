import { describe, expect, it, vi } from 'vitest';
import type { ThemeCardDTO } from '../lib/api';
import { hideContentOnDevice } from '../lib/content-safety';
import { blockedCreatorsSchema, isThemeHidden, visibleCreatorThemes } from '../lib/creator-blocks';
import {
  createPreferencesStore,
  DEFAULT_PREFERENCES,
  PreferenceReadError,
  preferencesSchema,
} from '../lib/preferences';

const id = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const otherId = 'abcdefab-cdef-4abc-8def-abcdefabcdea';
const creator = { handle: 'luna_art', displayName: 'Luna', avatarUrl: null };
const theme: ThemeCardDTO = {
  id,
  slug: 'lavender-haze',
  nameEn: 'Lavender',
  nameAr: 'لافندر',
  thumbUrl: null,
  dominantColor: null,
  tags: [],
  isFeatured: false,
  downloadCount: 0,
  favoriteCount: 0,
  creator,
  publishedAt: null,
};
function memory(value: unknown = DEFAULT_PREFERENCES): {
  getItem: ReturnType<typeof vi.fn<() => Promise<string | null>>>;
  setItem: ReturnType<typeof vi.fn<(key: string, value: string) => Promise<void>>>;
  read: () => unknown;
} {
  let raw = JSON.stringify(value);
  return {
    getItem: vi.fn(async () => raw),
    setItem: vi.fn(async (_key, value) => {
      raw = value;
    }),
    read: () => JSON.parse(raw) as unknown,
  };
}
function selection(creatorHandle: string | null = creator.handle) {
  return {
    id: otherId,
    slug: 'another-theme',
    nameEn: 'Other',
    nameAr: null,
    surface: '#ffffff',
    ink: '#16121d',
    accent: '#9734b1',
    appliedLocale: 'en' as const,
    creatorHandle,
  };
}

describe('native hidden-content preferences', () => {
  it('reads old v1 choices without overwriting favorites, language or legacy widgets', async () => {
    const { creatorHandle: _handle, ...legacyWidget } = selection();
    void _handle;
    const old = {
      v: 1,
      locale: 'ar',
      appearance: 'dark',
      favoriteIds: [id],
      widgetSelection: legacyWidget,
    };
    const storage = memory(old);
    const store = createPreferencesStore(storage);
    await store.hydrate();
    expect(store.getSnapshot().preferences).toMatchObject({
      locale: 'ar',
      favoriteIds: [id],
      blockedCreators: [],
      hiddenThemeIds: [],
      widgetSelection: { creatorHandle: null },
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    await store.update({
      blockedCreators: [{ handle: creator.handle, displayName: creator.displayName }],
    });
    expect(storage.read()).toMatchObject({
      locale: 'ar',
      appearance: 'dark',
      favoriteIds: [id],
      widgetSelection: { id: otherId },
      blockedCreators: [{ handle: creator.handle }],
    });
  });
  it('validates canonical handles, strict objects, limits and normalized UUID hides', () => {
    const first = { handle: creator.handle, displayName: creator.displayName };
    expect(blockedCreatorsSchema.parse([first, { ...first, displayName: 'Later' }])).toEqual([
      first,
    ]);
    for (const handle of ['admin', 'LUNA', 'luna\n', 'x', '../luna'])
      expect(blockedCreatorsSchema.safeParse([{ ...first, handle }]).success).toBe(false);
    expect(blockedCreatorsSchema.safeParse([{ ...first, userId: 'private-id' }]).success).toBe(
      false,
    );
    expect(blockedCreatorsSchema.safeParse(Array(501).fill(first)).success).toBe(false);
    expect(
      preferencesSchema.parse({ ...DEFAULT_PREFERENCES, hiddenThemeIds: [id.toUpperCase(), id] })
        .hiddenThemeIds,
    ).toEqual([id]);
    expect(
      preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, hiddenThemeIds: [`${id}\n`] }).success,
    ).toBe(false);
  });
  it('applies current creator/UUID hiding to cached pages and late results, and unblocks without losing the raw page', () => {
    const rows = [theme, { ...theme, id: otherId, creator: null }];
    const blocked = [{ handle: creator.handle, displayName: creator.displayName }];
    expect(visibleCreatorThemes(rows, blocked).map(({ id }) => id)).toEqual([otherId]);
    expect(visibleCreatorThemes([...rows], blocked, [otherId])).toEqual([]);
    expect(isThemeHidden(theme, blocked, [])).toBe(true);
    expect(visibleCreatorThemes(rows, []).map(({ id }) => id)).toEqual([id, otherId]);
    expect(rows).toHaveLength(2);
  });
  it('never changes native widgets or overwrites unread choices when the storage read fails', async () => {
    const storage = memory({ ...DEFAULT_PREFERENCES, locale: 'ar', favoriteIds: [id] });
    storage.getItem.mockRejectedValueOnce(new Error('denied'));
    const store = createPreferencesStore(storage);
    const clear = vi.fn(async () => {});
    await expect(hideContentOnDevice(store, theme, 'creator', clear)).rejects.toBeInstanceOf(
      PreferenceReadError,
    );
    expect(clear).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    await store.retryPersistence();
    await hideContentOnDevice(store, theme, 'creator', clear);
    expect(storage.read()).toMatchObject({
      locale: 'ar',
      favoriteIds: [id],
      blockedCreators: [{ handle: creator.handle }],
    });
  });
  it('clears a matching creator widget before persisting the block and leaves unrelated favorites intact', async () => {
    const storage = memory({
      ...DEFAULT_PREFERENCES,
      favoriteIds: [id],
      widgetSelection: selection(),
    });
    const store = createPreferencesStore(storage);
    const clear = vi.fn(async () => {
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(store.getSnapshot().preferences.widgetSelection?.id).toBe(otherId);
    });
    await hideContentOnDevice(store, theme, 'creator', clear);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(storage.read()).toMatchObject({
      favoriteIds: [id],
      widgetSelection: null,
      blockedCreators: [{ handle: creator.handle }],
    });
  });
  it('does not claim a block or alter stored choices when matching widget clearing fails', async () => {
    const storage = memory({ ...DEFAULT_PREFERENCES, widgetSelection: selection() });
    const store = createPreferencesStore(storage);
    await expect(
      hideContentOnDevice(
        store,
        theme,
        'creator',
        vi.fn(async () => {
          throw new Error('native failure');
        }),
      ),
    ).rejects.toThrow('native failure');
    expect(store.getSnapshot().preferences.blockedCreators).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('hides anonymous/retained artwork by UUID and clears its exact selected widget', async () => {
    const storage = memory({ ...DEFAULT_PREFERENCES, widgetSelection: { ...selection(null), id } });
    const store = createPreferencesStore(storage);
    const clear = vi.fn(async () => {});
    await hideContentOnDevice(store, { ...theme, creator: null }, 'theme', clear);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().preferences).toMatchObject({
      hiddenThemeIds: [id],
      widgetSelection: null,
    });
    expect(
      isThemeHidden(
        { ...theme, creator: null },
        [],
        store.getSnapshot().preferences.hiddenThemeIds,
      ),
    ).toBe(true);
  });
  it('preserves a successful hide in memory when saving fails and reuses the validated retry path', async () => {
    const storage = memory();
    storage.setItem.mockRejectedValueOnce(new Error('denied'));
    const store = createPreferencesStore(storage);
    await hideContentOnDevice(
      store,
      theme,
      'creator',
      vi.fn(async () => {}),
    );
    expect(store.getSnapshot()).toMatchObject({
      issue: 'WRITE_FAILED',
      preferences: { blockedCreators: [{ handle: creator.handle }] },
    });
    expect(Object.isFrozen(store.getSnapshot().preferences.blockedCreators)).toBe(true);
    await store.retryPersistence();
    expect(storage.read()).toMatchObject({ blockedCreators: [{ handle: creator.handle }] });
  });
});
