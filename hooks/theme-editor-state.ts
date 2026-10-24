import { paletteSchema, themeSpecSchema } from '../lib/render/spec';
import type { ThemeSpec, WallpaperSpec } from '../lib/render/spec';
import {
  EDITOR_COALESCE_MS,
  EDITOR_HISTORY_LIMIT,
  type EditorAction,
  type GeneratedWallpaperKind,
  type ThemeEditorState,
  type TimedEditorAction,
} from '../lib/studio';

// Midpoints of each kind's first content/aesthetics recipe. The provenance test
// keeps this small synchronous table aligned without shipping all recipe content.
export const STUDIO_WALLPAPER_DEFAULTS = {
  mesh: { kind: 'mesh', points: 6, softness: 0.8, grain: 0.06 },
  blobs: { kind: 'blobs', count: 5, blur: 0.425, grain: 0.06 },
  waves: { kind: 'waves', layers: 4, amplitude: 0.4, frequency: 0.5, grain: 0.065 },
  pattern: { kind: 'pattern', pattern: 'y2k-grid', scale: 1.4, rotation: 0 },
  scatter: {
    kind: 'scatter',
    density: 0.465,
    sizeMin: 0.0525,
    sizeMax: 0.115,
    rotate: true,
    grain: 0.065,
  },
  aurora: { kind: 'aurora', bands: 3, grain: 0.06 },
  sky: { kind: 'sky', mode: 'day', clouds: 0.4, stars: 0, moon: false, grain: 0.06 },
  shapes: { kind: 'shapes', density: 0.8, grain: 0.055 },
} satisfies {
  [Kind in GeneratedWallpaperKind]: Omit<
    Extract<WallpaperSpec, { kind: Kind }>,
    'seed' | 'colors' | 'glyphs' | 'weight'
  >;
};

/** Stable midpoints of the first curated recipe for each kind; never invent a photo asset. */
export function defaultWallpaper(kind: GeneratedWallpaperKind, spec: ThemeSpec): WallpaperSpec {
  const defaults = STUDIO_WALLPAPER_DEFAULTS[kind];
  if (!defaults) throw new RangeError('Unknown wallpaper kind');
  const common = { seed: 'seed' in spec.wallpaper ? spec.wallpaper.seed : 0, colors: null };
  if (defaults.kind === 'pattern') return { ...defaults, colors: null };
  if (defaults.kind === 'scatter')
    return {
      ...defaults,
      ...common,
      glyphs: spec.decor.length ? [...spec.decor] : ['circle'],
      weight: spec.icons.glyphWeight,
    };
  return { ...defaults, ...common };
}

/** Materialize once; subsequent home and lock edits are independent. */
export function calmerWallpaper(wallpaper: WallpaperSpec): WallpaperSpec {
  if (wallpaper.kind === 'pattern')
    return {
      ...wallpaper,
      scale: Math.min(3, wallpaper.scale * 1.2),
      rotation: wallpaper.rotation * 0.7,
    };
  if (wallpaper.kind === 'image') return { ...wallpaper };
  const seed = (wallpaper.seed + 1) % 2_147_483_648;
  switch (wallpaper.kind) {
    case 'scatter':
    case 'shapes':
      return { ...wallpaper, seed, density: wallpaper.density * 0.7 };
    case 'waves':
      return { ...wallpaper, seed, amplitude: wallpaper.amplitude * 0.7 };
    case 'sky':
      return { ...wallpaper, seed, clouds: wallpaper.clouds * 0.7, stars: wallpaper.stars * 0.7 };
    default:
      return { ...wallpaper, seed };
  }
}

export function initialThemeEditorState(spec: ThemeSpec): ThemeEditorState {
  const parsed = themeSpecSchema.parse(spec);
  return { spec: parsed, initialSpec: parsed, past: [], future: [], error: null, lastEdit: null };
}

function knownKeys(patch: object, value: object): boolean {
  return Object.keys(patch).every((key) => Object.hasOwn(value, key));
}

function mutedInk(ink: string, background: string): string {
  const channels = [1, 3, 5].map((offset) =>
    Math.round(
      parseInt(ink.slice(offset, offset + 2), 16) * 0.62 +
        parseInt(background.slice(offset, offset + 2), 16) * 0.38,
    )
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${channels.join('')}`;
}

function editedSpec(spec: ThemeSpec, action: EditorAction): unknown {
  switch (action.type) {
    case 'replaceSpec':
      return action.spec;
    case 'setPaletteRole':
      return Object.hasOwn(spec.palette, action.role) && String(action.role) !== 'mode'
        ? { ...spec, palette: { ...spec.palette, [action.role]: action.value } }
        : null;
    case 'applyPalettePreset': {
      const p = action.palette;
      const palette = paletteSchema.safeParse({ ...p, inkMuted: p.inkMuted ?? p.ink });
      return palette.success
        ? {
            ...spec,
            palette: {
              ...palette.data,
              inkMuted: p.inkMuted ?? mutedInk(palette.data.ink, palette.data.bg),
            },
          }
        : null;
    }
    case 'setWallpaper':
    case 'setPhotoWallpaper':
    case 'patchWallpaper':
    case 'shuffleSeed': {
      const target = action.target === 'lock' ? 'lockWallpaper' : 'wallpaper';
      const current = spec[target] ?? spec.wallpaper;
      let wallpaper: unknown;
      if (action.type === 'setWallpaper') wallpaper = defaultWallpaper(action.kind, spec);
      else if (action.type === 'setPhotoWallpaper')
        wallpaper = { kind: 'image', assetKey: action.assetKey, focalX: 0.5, focalY: 0.5, dim: 0 };
      else if (action.type === 'patchWallpaper')
        wallpaper = knownKeys(action.patch, current) ? { ...current, ...action.patch } : null;
      else
        wallpaper =
          'seed' in current
            ? { ...current, seed: action.seed ?? (current.seed + 1) % 2_147_483_648 }
            : current;
      return {
        ...spec,
        [target]: wallpaper,
        ...(action.type === 'setPhotoWallpaper' && action.palette
          ? { palette: action.palette }
          : {}),
        ...(action.type === 'setPhotoWallpaper' && action.icons ? { icons: action.icons } : {}),
      };
    }
    case 'setLockMode':
      return {
        ...spec,
        lockWallpaper:
          action.mode === 'same' ? null : (spec.lockWallpaper ?? calmerWallpaper(spec.wallpaper)),
      };
    case 'patchIcons':
      return knownKeys(action.patch, spec.icons)
        ? { ...spec, icons: { ...spec.icons, ...action.patch } }
        : null;
    case 'patchWidgets':
      return knownKeys(action.patch, spec.widgets)
        ? { ...spec, widgets: { ...spec.widgets, ...action.patch } }
        : null;
    case 'setFont':
      return action.role === 'body' || action.role === 'display'
        ? { ...spec, type: { ...spec.type, [action.role]: action.font } }
        : null;
    case 'setDecor':
      return { ...spec, decor: action.decor };
    default:
      return spec;
  }
}

function controlFor(action: EditorAction): string | null {
  switch (action.type) {
    case 'setPaletteRole':
      return `palette:${action.role}`;
    case 'patchWallpaper':
      return `wallpaper:${action.target ?? 'home'}:${action.control ?? Object.keys(action.patch).sort().join(',')}`;
    case 'patchIcons':
      return `icons:${action.control ?? Object.keys(action.patch).sort().join(',')}`;
    case 'patchWidgets':
      return `widgets:${action.control ?? Object.keys(action.patch).sort().join(',')}`;
    default:
      return null;
  }
}

export function themeEditorReducer(
  state: ThemeEditorState,
  action: TimedEditorAction | { type: 'clearError' },
): ThemeEditorState {
  if (action.type === 'clearError') return state.error ? { ...state, error: null } : state;
  if (action.type === 'load') {
    const loaded = themeSpecSchema.safeParse(action.spec);
    return loaded.success
      ? initialThemeEditorState(loaded.data)
      : { ...state, error: 'VALIDATION' };
  }
  if (action.type === 'undo') {
    const previous = state.past.at(-1);
    return previous
      ? {
          ...state,
          spec: previous,
          past: state.past.slice(0, -1),
          future: [state.spec, ...state.future].slice(0, EDITOR_HISTORY_LIMIT),
          error: null,
          lastEdit: null,
        }
      : state;
  }
  if (action.type === 'redo') {
    const next = state.future[0];
    return next
      ? {
          ...state,
          spec: next,
          past: [...state.past, state.spec].slice(-EDITOR_HISTORY_LIMIT),
          future: state.future.slice(1),
          error: null,
          lastEdit: null,
        }
      : state;
  }
  let candidate: unknown;
  try {
    candidate = action.type === 'reset' ? state.initialSpec : editedSpec(state.spec, action);
  } catch {
    return { ...state, error: 'VALIDATION' };
  }
  const parsed = themeSpecSchema.safeParse(candidate);
  if (!parsed.success) return { ...state, error: 'VALIDATION' };
  if (JSON.stringify(parsed.data) === JSON.stringify(state.spec))
    return state.error ? { ...state, error: null } : state;
  const control = controlFor(action);
  const elapsed = action.at - (state.lastEdit?.at ?? -Infinity);
  const coalesced =
    control !== null &&
    control === state.lastEdit?.control &&
    Number.isFinite(action.at) &&
    elapsed >= 0 &&
    elapsed <= EDITOR_COALESCE_MS;
  const unchanged = <T>(next: T, previous: T): T =>
    JSON.stringify(next) === JSON.stringify(previous) ? previous : next;
  const spec: ThemeSpec = {
    ...parsed.data,
    palette: unchanged(parsed.data.palette, state.spec.palette),
    wallpaper: unchanged(parsed.data.wallpaper, state.spec.wallpaper),
    lockWallpaper: unchanged(parsed.data.lockWallpaper, state.spec.lockWallpaper),
    icons: unchanged(parsed.data.icons, state.spec.icons),
    widgets: unchanged(parsed.data.widgets, state.spec.widgets),
    type: unchanged(parsed.data.type, state.spec.type),
    decor: unchanged(parsed.data.decor, state.spec.decor),
  };
  return {
    ...state,
    spec,
    past: coalesced ? state.past : [...state.past, state.spec].slice(-EDITOR_HISTORY_LIMIT),
    future: [],
    error: null,
    lastEdit: control && Number.isFinite(action.at) ? { control, at: action.at } : null,
  };
}
