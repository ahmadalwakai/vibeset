import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readIconSelection,
  reconcileIconSelection,
  writeIconSelection,
} from '../../../lib/client/icon-selection';
import type { AppDTO } from '../../../lib/dto';
import { ICON_SELECTION_KEY, MAX_CUSTOM_ICONS, MAX_SELECTED_APPS } from '../../../lib/icon-export';
import {
  appCatalogSchema,
  customIconSchema,
  iconSelectionSchema,
} from '../../../lib/validation/icon-export';

const custom = {
  id: 'custom-13f76d3b-357b-41ee-b125-33dcddc061f8',
  label: 'خرائطي',
  glyph: 'map-pin',
};
const apps: AppDTO[] = [
  { slug: 'x', name: 'X', aliases: ['تويتر'], glyph: 'chat-circle', category: 'social', rank: 1 },
];
function storage(value: string | null): {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
} {
  const fake = { getItem: vi.fn(() => value), setItem: vi.fn() };
  vi.stubGlobal('localStorage', fake);
  return fake;
}
afterEach(() => vi.unstubAllGlobals());

describe('persisted icon selection boundary', () => {
  it('preserves a valid intentionally empty selection', () => {
    storage(JSON.stringify({ v: 1, appSlugs: [], custom: [] }));
    expect(readIconSelection()).toEqual({ v: 1, appSlugs: [], custom: [] });
  });
  it.each([null, '', '{', '{}', 'null', 'x'.repeat(32_769)])(
    'treats missing/corrupt data as absent: %s',
    (value) => {
      storage(value);
      expect(readIconSelection()).toBeNull();
    },
  );
  it('normalizes IDs and deduplicates selected app slugs in first-occurrence order', () => {
    const selection = iconSelectionSchema.parse({
      v: 1,
      appSlugs: ['x', 'camera', 'x'],
      custom: [{ ...custom, id: custom.id.toUpperCase(), label: '  خرائطي  ' }],
    });
    expect(selection).toEqual({ v: 1, appSlugs: ['x', 'camera'], custom: [custom] });
  });
  it('rejects invalid custom filenames, unsafe glyphs, controls and duplicate IDs', () => {
    for (const patch of [
      { id: 'custom-../escape' },
      { glyph: '<svg>' },
      { label: 'a\nb' },
      { label: '' },
      { label: 'a'.repeat(25) },
    ])
      expect(customIconSchema.safeParse({ ...custom, ...patch }).success).toBe(false);
    expect(
      iconSelectionSchema.safeParse({ v: 1, appSlugs: [], custom: [custom, custom] }).success,
    ).toBe(false);
    expect(
      iconSelectionSchema.safeParse({ v: 1, appSlugs: [custom.id], custom: [custom] }).success,
    ).toBe(false);
  });
  it('enforces selected and custom output limits', () => {
    expect(
      iconSelectionSchema.safeParse({
        v: 1,
        appSlugs: Array.from({ length: MAX_SELECTED_APPS + 1 }, (_, i) => `app-${i}`),
        custom: [],
      }).success,
    ).toBe(false);
    expect(
      iconSelectionSchema.safeParse({
        v: 1,
        appSlugs: [],
        custom: Array.from({ length: MAX_CUSTOM_ICONS + 1 }, () => custom),
      }).success,
    ).toBe(false);
  });
  it('removes stale catalog and manifest entries while retaining the order of valid choices', () => {
    const selection = { v: 1 as const, appSlugs: ['missing', 'x'], custom: [custom] };
    expect(reconcileIconSelection(selection, apps, ['map-pin'])).toEqual({
      ...selection,
      appSlugs: ['x'],
    });
    expect(reconcileIconSelection(selection, apps, ['sparkle']).custom).toEqual([]);
    expect(reconcileIconSelection(selection, apps).custom).toEqual([custom]);
  });
  it('validates writes and remains usable with blocked storage', () => {
    const fake = storage(null);
    const selection = { v: 1 as const, appSlugs: ['x'], custom: [custom] };
    writeIconSelection(selection);
    expect(fake.setItem).toHaveBeenCalledWith(ICON_SELECTION_KEY, JSON.stringify(selection));
    fake.getItem.mockImplementation(() => {
      throw new Error('denied');
    });
    fake.setItem.mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readIconSelection()).toEqual(selection);
    const copy = readIconSelection();
    copy?.appSlugs.push('camera');
    expect(readIconSelection()).toEqual(selection);
    expect(() => writeIconSelection(selection)).not.toThrow();
  });
  it('treats readable corrupted storage as invalid even after a previous valid selection', () => {
    storage(null);
    writeIconSelection({ v: 1, appSlugs: ['x'], custom: [] });
    storage('{');
    expect(readIconSelection()).toBeNull();
  });
  it('accepts the one-character catalog slug and Arabic aliases but rejects duplicate catalog IDs', () => {
    expect(appCatalogSchema.parse(apps)).toEqual(apps);
    expect(appCatalogSchema.safeParse([...apps, ...apps]).success).toBe(false);
  });
});
