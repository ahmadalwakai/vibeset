import { z } from 'zod';
import type { NativeIconPack } from '../../lib/validation/native-icon-pack';
import { nativeIconPackSchema } from '../../lib/validation/native-icon-pack';
import type { PreferenceStorage } from './preferences';
import { PreferenceReadError } from './preferences';

const slugs = z
  .array(
    z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .max(80),
  )
  .max(125);
const progressSchema = z.strictObject({
  v: z.literal(1),
  specHash: z.string().regex(/^[a-f0-9]{64}$/),
  selected: slugs,
  saved: slugs,
  done: slugs,
  wallpaperSaved: z.boolean(),
  wallpaperSet: z.boolean(),
  widgetAdded: z.boolean(),
});
export type ThemeSetupProgress = z.infer<typeof progressSchema>;
export interface ThemeSetupSnapshot {
  progress: ThemeSetupProgress;
  loading: boolean;
  saving: boolean;
  issue: 'READ_FAILED' | 'INVALID_STORAGE' | 'WRITE_FAILED' | null;
}

export function createThemeSetupStore(
  storage: PreferenceStorage,
  input: NativeIconPack,
): {
  getSnapshot: () => ThemeSetupSnapshot;
  subscribe: (listener: () => void) => () => void;
  hydrate: () => Promise<void>;
  update: (change: (progress: ThemeSetupProgress) => ThemeSetupProgress) => Promise<void>;
  retry: () => Promise<void>;
} {
  const pack = nativeIconPackSchema.parse(input);
  const key = `vibeset:native-setup:v1:${pack.themeId}`;
  const allowed = new Set(pack.icons.map((icon) => icon.appSlug));
  const defaults: ThemeSetupProgress = {
    v: 1,
    specHash: pack.specHash,
    selected: pack.icons.slice(0, 24).map((icon) => icon.appSlug),
    saved: [],
    done: [],
    wallpaperSaved: false,
    wallpaperSet: false,
    widgetAdded: false,
  };
  const reconcile = (value: unknown): ThemeSetupProgress => {
    const parsed = progressSchema.parse(value);
    if (parsed.specHash !== pack.specHash) return { ...defaults };
    const clean = (values: string[]): string[] =>
      [...new Set(values)].filter((id) => allowed.has(id));
    const saved = clean(parsed.saved);
    return {
      ...parsed,
      selected: clean(parsed.selected),
      saved,
      done: clean(parsed.done).filter((id) => saved.includes(id)),
      wallpaperSet: parsed.wallpaperSaved && parsed.wallpaperSet,
    };
  };
  let snapshot: ThemeSetupSnapshot = {
    progress: defaults,
    loading: true,
    saving: false,
    issue: null,
  };
  let known = false;
  let hydration: Promise<void> | undefined;
  let queue = Promise.resolve();
  let revision = 0;
  const listeners = new Set<() => void>();
  const emit = (next: ThemeSetupSnapshot): void => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const read = async (): Promise<void> => {
    let raw: string | null;
    try {
      raw = await storage.getItem(key);
    } catch {
      emit({ ...snapshot, loading: false, issue: 'READ_FAILED' });
      return;
    }
    known = true;
    try {
      if (raw !== null && raw.length > 32_768) throw new RangeError('Setup record too large');
      const progress = raw === null ? defaults : reconcile(JSON.parse(raw) as unknown);
      emit({ progress, loading: false, saving: false, issue: null });
    } catch {
      emit({ progress: defaults, loading: false, saving: false, issue: 'INVALID_STORAGE' });
    }
  };
  const hydrate = (): Promise<void> => (hydration ??= read());
  const update = async (
    change: (progress: ThemeSetupProgress) => ThemeSetupProgress,
  ): Promise<void> => {
    await hydrate();
    if (!known) throw new PreferenceReadError();
    const progress = reconcile(change(snapshot.progress));
    const serialized = JSON.stringify(progress);
    const ownRevision = ++revision;
    emit({ ...snapshot, progress, saving: true });
    const write = queue.then(async () => {
      try {
        await storage.setItem(key, serialized);
        if (ownRevision === revision) emit({ ...snapshot, saving: false, issue: null });
      } catch {
        if (ownRevision === revision) emit({ ...snapshot, saving: false, issue: 'WRITE_FAILED' });
      }
    });
    queue = write;
    await write;
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
    update,
    retry: async () => {
      if (!known) await read();
      else await update((current) => current);
    },
  };
}

export function setupIsComplete(progress: ThemeSetupProgress, widgetSelected: boolean): boolean {
  return (
    progress.wallpaperSet &&
    progress.widgetAdded &&
    widgetSelected &&
    progress.selected.length > 0 &&
    progress.selected.every((id) => progress.done.includes(id))
  );
}
