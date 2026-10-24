import { describe, expect, it } from 'vitest';
import {
  iconExportReducer,
  INITIAL_ICON_EXPORT_STATE,
  resolveExportSelection,
} from '@/components/theme/icon-export-state';
import type { AppDTO } from '@/lib/dto';
import type { IconSelection } from '@/lib/icon-export';

const file = new File(['icon'], 'vibeset-test-phone.png', { type: 'image/png' });
const start = (): ReturnType<typeof iconExportReducer> =>
  iconExportReducer(INITIAL_ICON_EXPORT_STATE, { type: 'start', run: 1, total: 24 });

describe('icon export lifecycle', () => {
  it('ignores a cancelled generation resolving after cancellation', () => {
    const cancelled = iconExportReducer(start(), { type: 'cancel', run: 1 });
    expect(cancelled.phase).toBe('pick');
    expect(iconExportReducer(cancelled, { type: 'complete', run: 1, files: [file] })).toBe(
      cancelled,
    );
    expect(iconExportReducer(cancelled, { type: 'fail', run: 1 })).toBe(cancelled);
  });

  it('does not let an old job replace the new job or update its progress', () => {
    const next = iconExportReducer(start(), { type: 'start', run: 2, total: 12 });
    expect(iconExportReducer(next, { type: 'progress', run: 1, completed: 24 })).toBe(next);
    expect(iconExportReducer(next, { type: 'complete', run: 1, files: [file] })).toBe(next);
    expect(iconExportReducer(next, { type: 'start', run: 1, total: 24 })).toBe(next);
  });

  it('keeps progress monotonic and within the expected file count', () => {
    const progressed = iconExportReducer(start(), { type: 'progress', run: 1, completed: 12 });
    expect(
      iconExportReducer(progressed, { type: 'progress', run: 1, completed: 6 }).completed,
    ).toBe(12);
    expect(
      iconExportReducer(progressed, { type: 'progress', run: 1, completed: 100 }).completed,
    ).toBe(24);
  });

  it('deduplicates warnings and saves while keeping warnings visible on completion', () => {
    const warning = { type: 'warning', run: 1, warning: 'photo-wallpaper-fallback' } as const;
    const warned = iconExportReducer(iconExportReducer(start(), warning), warning);
    expect(warned.warnings).toEqual(['photo-wallpaper-fallback']);
    const completed = iconExportReducer(warned, { type: 'complete', run: 1, files: [file] });
    const saved = iconExportReducer(completed, { type: 'saved', run: 1, batch: 0 });
    expect(iconExportReducer(saved, { type: 'saved', run: 1, batch: 0 })).toBe(saved);
    expect(saved.phase).toBe('save');
    expect(saved.warnings).toEqual(warned.warnings);
    expect(saved.savedBatches).toEqual([0]);
  });

  it('clears file references and save markers before editing or a new export', () => {
    const completed = iconExportReducer(start(), { type: 'complete', run: 1, files: [file] });
    const edited = iconExportReducer(completed, { type: 'edit', run: 1 });
    expect(edited.files).toEqual([]);
    expect(edited.savedBatches).toEqual([]);
    expect(edited.phase).toBe('pick');
    const next = iconExportReducer(completed, { type: 'start', run: 2, total: 3 });
    expect(next.files).toEqual([]);
    expect(next.warnings).toEqual([]);
  });

  it('shows an error for an empty result and permits a new run after a failure', () => {
    expect(iconExportReducer(start(), { type: 'complete', run: 1, files: [] }).phase).toBe('error');
    const failed = iconExportReducer(start(), { type: 'fail', run: 1 });
    expect(iconExportReducer(failed, { type: 'start', run: 2, total: 24 }).phase).toBe(
      'generating',
    );
  });
});

describe('export selection planning', () => {
  const apps: AppDTO[] = [
    { slug: 'phone', name: 'Phone', aliases: [], category: 'system', glyph: 'phone', rank: 1 },
    { slug: 'maps', name: 'Maps', aliases: [], category: 'travel', glyph: 'map-pin', rank: 2 },
  ];
  const selection: IconSelection = {
    v: 1,
    appSlugs: ['maps', 'retired-app', 'phone'],
    custom: [
      { id: 'custom-11111111-1111-4111-8111-111111111111', label: 'My app', glyph: 'heart' },
      {
        id: 'custom-22222222-2222-4222-8222-222222222222',
        label: 'Old app',
        glyph: 'retired-symbol',
      },
    ],
  };

  it('keeps saved app order for export batches and drops retired catalogue IDs', () => {
    const result = resolveExportSelection(selection, apps);
    expect(result.apps.map(({ slug }) => slug)).toEqual(['maps', 'phone']);
    expect(result.selection.appSlugs).toEqual(['maps', 'phone']);
  });

  it('retains custom icons while metadata is unavailable, then removes stale glyphs once known', () => {
    expect(resolveExportSelection(selection, apps).selection.custom).toEqual(selection.custom);
    const result = resolveExportSelection(selection, apps, ['heart', 'moon']);
    expect(result.selection.custom).toEqual([selection.custom[0]]);
    expect(selection.custom).toHaveLength(2);
    expect(selection.appSlugs).toEqual(['maps', 'retired-app', 'phone']);
  });

  it('preserves a deliberate empty selection after stale customs are reconciled', () => {
    const empty = resolveExportSelection({ ...selection, appSlugs: [] }, apps, []);
    expect(empty.selection.appSlugs).toEqual([]);
    expect(empty.selection.custom).toEqual([]);
    expect(empty.apps).toEqual([]);
  });
});
