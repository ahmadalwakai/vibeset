import { describe, expect, it } from 'vitest';
import { getPalette } from '../../../content/palettes';
import { AESTHETICS } from '../../../content/aesthetics';
import type { WallpaperChoice } from '../../../lib/generator';
import {
  calmerWallpaper,
  defaultWallpaper,
  STUDIO_WALLPAPER_DEFAULTS,
  initialThemeEditorState,
  themeEditorReducer,
} from '../../../hooks/theme-editor-state';
import { themeSpecSchema, type ThemeSpec } from '../../../lib/render/spec';
import {
  EDITOR_HISTORY_LIMIT,
  type EditorAction,
  type GeneratedWallpaperKind,
  type ThemeEditorState,
} from '../../../lib/studio';
import { wallpaperFixture } from '../render/wallpaper-fixture';

function edit(state: ThemeEditorState, action: EditorAction, at = 0): ThemeEditorState {
  return themeEditorReducer(state, { ...action, at });
}
const initial = (): ThemeEditorState => initialThemeEditorState(wallpaperFixture());

describe('creator photo editing', () => {
  const assetKey = 'uploads/wallpapers/123e4567-e89b-42d3-a456-426614174000/full.jpg';
  it('applies photo, palette and icon suggestion as one undoable edit', () => {
    const state = initial();
    const palette = { ...state.spec.palette, bg: '#123456' };
    const icons = { ...state.spec.icons, fill: 'outline' as const };
    const next = edit(state, { type: 'setPhotoWallpaper', assetKey, palette, icons });
    expect(next.spec.wallpaper).toEqual({
      kind: 'image',
      assetKey,
      focalX: 0.5,
      focalY: 0.5,
      dim: 0,
    });
    expect(next.spec.palette).toEqual(palette);
    expect(next.spec.icons).toEqual(icons);
    expect(next.past).toHaveLength(1);
    const undone = edit(next, { type: 'undo' });
    expect(undone.spec).toEqual(state.spec);
    expect(edit(undone, { type: 'redo' }).spec).toEqual(next.spec);
  });
  it('sets a separate lock photo and rejects unsafe asset keys atomically', () => {
    const state = initial();
    const next = edit(state, { type: 'setPhotoWallpaper', assetKey, target: 'lock' });
    expect(next.spec.wallpaper).toEqual(state.spec.wallpaper);
    expect(next.spec.lockWallpaper).toMatchObject({ kind: 'image', assetKey });
    const invalid = edit(next, {
      type: 'setPhotoWallpaper',
      assetKey: '../secret',
      palette: { ...next.spec.palette, bg: '#000000' },
    });
    expect(invalid.error).toBe('VALIDATION');
    expect(invalid.spec).toEqual(next.spec);
    expect(invalid.past).toEqual(next.past);
  });
});

describe('validated editor changes', () => {
  it('keeps the lightweight default table aligned with first curated recipe range midpoints', () => {
    const choices: readonly WallpaperChoice[] = AESTHETICS.flatMap(
      (recipe) => recipe.wallpapers as readonly WallpaperChoice[],
    );
    for (const defaults of Object.values(STUDIO_WALLPAPER_DEFAULTS)) {
      const choice = choices.find((candidate) => candidate.kind === defaults.kind);
      expect(choice).toBeDefined();
      for (const [key, range] of Object.entries(choice?.params ?? {})) {
        const actual: unknown = Reflect.get(defaults, key);
        if (Array.isArray(range)) {
          const midpoint = (Number(range[0]) + Number(range[1])) / 2;
          expect(actual).toBeCloseTo(
            ['points', 'count', 'layers', 'bands'].includes(key) ? Math.round(midpoint) : midpoint,
            12,
          );
        } else expect(actual).toEqual(range);
      }
    }
  });
  it('edits every non-wallpaper panel without mutating its input or initial baseline', () => {
    const state = initial();
    const palette = getPalette('midnight-y2k');
    if (!palette) throw new Error('Required curated palette missing');
    let next = edit(state, { type: 'applyPalettePreset', palette });
    expect(next.spec.palette.bg).toBe(palette.bg);
    expect(next.spec.palette.inkMuted).toMatch(/^#[0-9a-f]{6}$/);
    next = edit(next, { type: 'setPaletteRole', role: 'accent', value: '#ABCDEF' });
    expect(next.spec.palette.accent).toBe('#abcdef');
    next = edit(next, {
      type: 'patchIcons',
      patch: {
        fill: 'gradient',
        bg2: '#123456',
        border: { width: 0.03, color: '#ffffff' },
        sticker: { glyph: 'heart', color: '#123456', corner: 'tr' },
      },
    });
    next = edit(next, { type: 'patchWidgets', patch: { radius: 0.4, style: 'paper' } });
    next = edit(next, { type: 'setFont', role: 'display', font: 'pacifico' });
    next = edit(next, { type: 'setFont', role: 'body', font: 'el-messiri' });
    next = edit(next, { type: 'setDecor', decor: ['flower'] });
    expect(next.spec.icons).toMatchObject({ fill: 'gradient', bg2: '#123456' });
    expect(next.spec.widgets).toMatchObject({ radius: 0.4, style: 'paper' });
    expect(next.spec.type).toEqual({ display: 'pacifico', body: 'el-messiri' });
    expect(next.spec.decor).toEqual(['flower']);
    expect(themeSpecSchema.safeParse(next.spec).success).toBe(true);
    expect(state.spec).toEqual(wallpaperFixture());
    expect(next.initialSpec).toEqual(wallpaperFixture());
  });

  it.each<GeneratedWallpaperKind>([
    'mesh',
    'blobs',
    'waves',
    'pattern',
    'scatter',
    'aurora',
    'sky',
    'shapes',
  ])('switches to valid deterministic curated %s defaults', (kind) => {
    const state = initial();
    const next = edit(state, { type: 'setWallpaper', kind });
    expect(next.spec.wallpaper).toEqual(defaultWallpaper(kind, state.spec));
    expect(next.spec.wallpaper.kind).toBe(kind);
    expect(themeSpecSchema.safeParse(next.spec).success).toBe(true);
    if (kind === 'mesh')
      expect(next.spec.wallpaper).toMatchObject({ points: 6, softness: 0.8, seed: 42 });
  });

  it('supports empty decor scatter and materializes a lock copy only when edited', () => {
    let state = edit(initial(), { type: 'setDecor', decor: [] });
    state = edit(state, { type: 'setWallpaper', kind: 'scatter' });
    expect(state.spec.wallpaper).toMatchObject({ kind: 'scatter', glyphs: ['circle'] });
    expect(state.spec.lockWallpaper).toBeNull();
    const home = state.spec.wallpaper;
    state = edit(state, { type: 'patchWallpaper', target: 'lock', patch: { density: 0.1 } });
    expect(state.spec.wallpaper).toEqual(home);
    expect(state.spec.lockWallpaper).toMatchObject({ kind: 'scatter', density: 0.1 });
  });

  it('materializes a calmer variant once and preserves independent edits', () => {
    let state = edit(initial(), { type: 'setWallpaper', kind: 'sky' });
    state = edit(state, { type: 'setLockMode', mode: 'variant' });
    const lock = state.spec.lockWallpaper;
    expect(lock).toEqual(calmerWallpaper(state.spec.wallpaper));
    state = edit(state, { type: 'patchWallpaper', patch: { clouds: 0.9 } });
    expect(state.spec.lockWallpaper).toEqual(lock);
    state = edit(state, { type: 'setLockMode', mode: 'variant' });
    expect(state.spec.lockWallpaper).toEqual(lock);
    state = edit(state, { type: 'setLockMode', mode: 'same' });
    expect(state.spec.lockWallpaper).toBeNull();
  });

  it('shuffles only seeded kinds and keeps the PRNG boundary valid', () => {
    let state = edit(initial(), { type: 'shuffleSeed', seed: 2_147_483_647 });
    expect(state.spec.wallpaper).toMatchObject({ seed: 2_147_483_647 });
    state = edit(state, { type: 'shuffleSeed' });
    expect(state.spec.wallpaper).toMatchObject({ seed: 0 });
    state = edit(state, { type: 'setWallpaper', kind: 'pattern' });
    expect(edit(state, { type: 'shuffleSeed', seed: 33 })).toBe(state);
  });

  it.each<EditorAction>([
    { type: 'setPaletteRole', role: 'bg', value: 'red' },
    { type: 'patchIcons', patch: { fill: 'gradient', bg2: null } },
    { type: 'patchIcons', patch: { glyphScale: 0.71 } },
    { type: 'patchWidgets', patch: { radius: -1 } },
    { type: 'patchWallpaper', patch: { points: 8 } },
    { type: 'patchWallpaper', patch: { density: 0.3 } },
    { type: 'shuffleSeed', seed: -1 },
    { type: 'setDecor', decor: ['<svg>'] },
  ])('rejects invalid $type changes without advancing history', (action) => {
    const state = edit(initial(), { type: 'shuffleSeed', seed: 5 });
    const next = edit(state, action);
    expect(next).toEqual({ ...state, error: 'VALIDATION' });
    expect(next.spec).toBe(state.spec);
    expect(next.past).toBe(state.past);
    expect(themeEditorReducer(next, { type: 'clearError' }).error).toBeNull();
  });

  it('rejects cross-field scatter bounds and invalid load without losing the reset baseline', () => {
    const state = edit(initial(), { type: 'setWallpaper', kind: 'scatter' });
    expect(
      edit(state, { type: 'patchWallpaper', patch: { sizeMin: 0.2, sizeMax: 0.1 } }).error,
    ).toBe('VALIDATION');
    expect(
      edit(state, { type: 'load', spec: { ...state.spec, v: 2 } as unknown as ThemeSpec }),
    ).toEqual({ ...state, error: 'VALIDATION' });
  });
});

describe('history and reset', () => {
  it('coalesces one control within 400ms while other controls and targets start new entries', () => {
    let state = edit(initial(), { type: 'patchIcons', patch: { glyphScale: 0.56 } }, 0);
    state = edit(state, { type: 'patchIcons', patch: { glyphScale: 0.57 } }, 400);
    expect(state.past).toHaveLength(1);
    state = edit(state, { type: 'patchIcons', patch: { glyphScale: 0.58 } }, 801);
    expect(state.past).toHaveLength(2);
    state = edit(state, { type: 'patchIcons', patch: { shadow: true } }, 802);
    expect(state.past).toHaveLength(3);
    state = edit(state, { type: 'patchWallpaper', patch: { softness: 0.6 } }, 803);
    state = edit(state, { type: 'patchWallpaper', target: 'lock', patch: { softness: 0.7 } }, 804);
    expect(state.past).toHaveLength(5);
    state = edit(state, { type: 'undo' });
    expect(state.spec.lockWallpaper).toBeNull();
  });

  it('allows explicit slider control keys and does not coalesce across undo or reversed time', () => {
    let state = edit(
      initial(),
      {
        type: 'patchIcons',
        control: 'border-width',
        patch: { border: { width: 0.01, color: '#111111' } },
      },
      100,
    );
    state = edit(
      state,
      {
        type: 'patchIcons',
        control: 'border-width',
        patch: { border: { width: 0.02, color: '#111111' } },
      },
      200,
    );
    expect(state.past).toHaveLength(1);
    state = edit(
      state,
      {
        type: 'patchIcons',
        control: 'border-color',
        patch: { border: { width: 0.02, color: '#222222' } },
      },
      201,
    );
    expect(state.past).toHaveLength(2);
    state = edit(state, { type: 'undo' });
    state = edit(
      state,
      {
        type: 'patchIcons',
        control: 'border-width',
        patch: { border: { width: 0.03, color: '#111111' } },
      },
      199,
    );
    expect(state.past).toHaveLength(2);
    expect(state.future).toEqual([]);
  });

  it('keeps exactly 50 undo entries and truncates redo after a genuine edit', () => {
    let state = initial();
    for (let seed = 0; seed < 60; seed += 1) state = edit(state, { type: 'shuffleSeed', seed });
    expect(state.past).toHaveLength(EDITOR_HISTORY_LIMIT);
    for (let i = 0; i < 55; i += 1) state = edit(state, { type: 'undo' });
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(50);
    expect(state.spec.wallpaper).toMatchObject({ seed: 9 });
    state = edit(state, { type: 'redo' });
    expect(state.spec.wallpaper).toMatchObject({ seed: 10 });
    state = edit(state, { type: 'shuffleSeed', seed: 10 });
    expect(state.future).toHaveLength(49);
    state = edit(state, { type: 'shuffleSeed', seed: 99 });
    expect(state.future).toHaveLength(0);
  });

  it('resets to the initial entry and allows undo; load establishes a new baseline with empty history', () => {
    let state = edit(initial(), { type: 'setFont', role: 'display', font: 'pacifico' });
    state = edit(state, { type: 'reset' });
    expect(state.spec).toEqual(wallpaperFixture());
    expect(edit(state, { type: 'undo' }).spec.type.display).toBe('pacifico');
    const loaded = { ...wallpaperFixture(), decor: ['flower'] };
    state = edit(state, { type: 'load', spec: loaded });
    expect(state).toEqual(initialThemeEditorState(loaded));
    state = edit(state, { type: 'setDecor', decor: [] });
    expect(edit(state, { type: 'reset' }).spec).toEqual(loaded);
  });
});
