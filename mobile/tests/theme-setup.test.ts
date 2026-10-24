import { describe, expect, it, vi } from 'vitest';
import packs from '../../content/native-beta/icon-packs.json';
import { nativeIconPackSchema } from '../../lib/validation/native-icon-pack';
import { PreferenceReadError } from '../lib/preferences';
import { createThemeSetupStore, setupIsComplete } from '../lib/theme-setup';

const pack = nativeIconPackSchema.parse(packs[0]);
function storage(raw: string | null = null): {
  getItem: ReturnType<typeof vi.fn<() => Promise<string | null>>>;
  setItem: ReturnType<typeof vi.fn<(key: string, value: string) => Promise<void>>>;
} {
  let value = raw;
  return {
    getItem: vi.fn(async () => value),
    setItem: vi.fn(async (_key, next) => {
      value = next;
    }),
  };
}

describe('native theme setup progress', () => {
  it('starts with24 real catalogue apps, writes nothing on visit, and preserves intentional empty selection', async () => {
    const disk = storage();
    const store = createThemeSetupStore(disk, pack);
    await Promise.all([store.hydrate(), store.hydrate()]);
    expect(disk.getItem).toHaveBeenCalledTimes(1);
    expect(disk.setItem).not.toHaveBeenCalled();
    expect(store.getSnapshot().progress.selected).toEqual(
      pack.icons.slice(0, 24).map((icon) => icon.appSlug),
    );
    await store.update((value) => ({ ...value, selected: [] }));
    const reopened = createThemeSetupStore(disk, pack);
    await reopened.hydrate();
    expect(reopened.getSnapshot().progress.selected).toEqual([]);
  });

  it('does not overwrite unreadable choices and retries the read before permitting changes', async () => {
    const disk = storage();
    disk.getItem.mockRejectedValueOnce(new Error('temporary native failure'));
    const store = createThemeSetupStore(disk, pack);
    await expect(store.update((value) => ({ ...value, selected: [] }))).rejects.toBeInstanceOf(
      PreferenceReadError,
    );
    expect(disk.setItem).not.toHaveBeenCalled();
    expect(store.getSnapshot().issue).toBe('READ_FAILED');
    await store.retry();
    await store.update((value) => ({ ...value, selected: [] }));
    expect(disk.setItem).toHaveBeenCalledTimes(1);
  });

  it('shares concurrent recovery reads so a late retry cannot replace newly saved progress', async () => {
    const disk = storage();
    disk.getItem.mockRejectedValueOnce(new Error('temporary native failure'));
    const store = createThemeSetupStore(disk, pack);
    await store.hydrate();
    expect(store.getSnapshot().issue).toBe('READ_FAILED');

    let resolveRead: (value: string | null) => void = () => {};
    const pendingRead = new Promise<string | null>((resolve) => {
      resolveRead = resolve;
    });
    disk.getItem.mockImplementationOnce(() => pendingRead);
    const firstRetry = store.retry();
    const secondRetry = store.retry();
    expect(disk.getItem).toHaveBeenCalledTimes(2);
    expect(disk.setItem).not.toHaveBeenCalled();

    resolveRead(null);
    await firstRetry;
    await store.update((value) => ({ ...value, saved: ['phone'] }));
    await secondRetry;
    expect(store.getSnapshot().progress.saved).toEqual(['phone']);
    expect(disk.getItem).toHaveBeenCalledTimes(2);

    // Once the baseline is known, explicit retry persists current choices;
    // it must never read an older disk snapshot over them.
    await store.retry();
    expect(disk.getItem).toHaveBeenCalledTimes(2);
    const reopened = createThemeSetupStore(disk, pack);
    await reopened.hydrate();
    expect(reopened.getSnapshot().progress.saved).toEqual(['phone']);
  });

  it('retains partial Photos success and confirmed steps across app reopen without marking unsaved icons installed', async () => {
    const disk = storage();
    const store = createThemeSetupStore(disk, pack);
    await store.update((value) => ({
      ...value,
      selected: ['phone', 'messages'],
      saved: ['phone'],
      done: ['phone', 'messages'],
      wallpaperSet: true,
    }));
    const reopened = createThemeSetupStore(disk, pack);
    await reopened.hydrate();
    expect(reopened.getSnapshot().progress).toMatchObject({
      saved: ['phone'],
      done: ['phone'],
      wallpaperSet: false,
    });
    expect(setupIsComplete(reopened.getSnapshot().progress, true)).toBe(false);
  });

  it('serializes overlapping saved-file callbacks without losing either completed file', async () => {
    const disk = storage();
    const store = createThemeSetupStore(disk, pack);
    await Promise.all(
      ['phone', 'messages'].map((id) =>
        store.update((value) => ({ ...value, saved: [...value.saved, id] })),
      ),
    );
    const restored = createThemeSetupStore(disk, pack);
    await restored.hydrate();
    expect(restored.getSnapshot().progress.saved).toEqual(['phone', 'messages']);
  });

  it('surfaces failed persistence and retries the exact in-memory completed progress', async () => {
    const disk = storage();
    disk.setItem.mockRejectedValueOnce(new Error('disk unavailable'));
    const store = createThemeSetupStore(disk, pack);
    await store.update((value) => ({ ...value, saved: ['phone'] }));
    expect(store.getSnapshot()).toMatchObject({
      issue: 'WRITE_FAILED',
      progress: { saved: ['phone'] },
    });
    await store.retry();
    expect(store.getSnapshot().issue).toBe(null);
    const restored = createThemeSetupStore(disk, pack);
    await restored.hydrate();
    expect(restored.getSnapshot().progress.saved).toEqual(['phone']);
  });

  it('resets progress when the pack artwork changes and reconciles removed app IDs', async () => {
    const initial = createThemeSetupStore(storage(), pack).getSnapshot().progress;
    const changed = createThemeSetupStore(
      storage(
        JSON.stringify({ ...initial, specHash: '0'.repeat(64), saved: ['phone'], done: ['phone'] }),
      ),
      pack,
    );
    await changed.hydrate();
    expect(changed.getSnapshot().progress.saved).toEqual([]);
    const removed = createThemeSetupStore(
      storage(
        JSON.stringify({
          ...initial,
          selected: ['phone', 'removed-app'],
          saved: ['phone', 'removed-app'],
          done: ['phone', 'removed-app'],
        }),
      ),
      pack,
    );
    await removed.hydrate();
    expect(removed.getSnapshot().progress).toMatchObject({
      selected: ['phone'],
      saved: ['phone'],
      done: ['phone'],
    });
  });

  it.each(['not json', '{}', 'x'.repeat(32_769)])(
    'discloses corrupt records without silently writing defaults',
    async (raw) => {
      const disk = storage(raw);
      const store = createThemeSetupStore(disk, pack);
      await store.hydrate();
      expect(store.getSnapshot().issue).toBe('INVALID_STORAGE');
      expect(disk.setItem).not.toHaveBeenCalled();
    },
  );

  it('requires explicit wallpaper/icon/widget confirmations and the matching selected widget', async () => {
    const store = createThemeSetupStore(storage(), pack);
    await store.update((value) => ({
      ...value,
      selected: ['phone'],
      saved: ['phone'],
      done: ['phone'],
      wallpaperSaved: true,
      wallpaperSet: true,
      widgetAdded: true,
    }));
    expect(setupIsComplete(store.getSnapshot().progress, true)).toBe(true);
    expect(setupIsComplete(store.getSnapshot().progress, false)).toBe(false);
    await store.update((value) => ({ ...value, selected: [] }));
    expect(setupIsComplete(store.getSnapshot().progress, true)).toBe(false);
  });
});
