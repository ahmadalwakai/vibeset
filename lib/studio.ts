import type { ThemeSpec, WallpaperSpec, IconStyle } from './render/spec';
import type { FontId, Palette } from './render/types';
import type { GeneratedWallpaperKind } from './generator';
import type { ReactNode } from 'react';

export type { GeneratedWallpaperKind } from './generator';

export const STUDIO_DRAFT_KEY = 'vibeset:studio-draft';
export const MAX_STUDIO_DRAFT_LENGTH = 32_768;
export const MAX_STUDIO_URL_LENGTH = 6_000;
export const EDITOR_HISTORY_LIMIT = 50;
export const EDITOR_COALESCE_MS = 400;
export const STUDIO_AUTOSAVE_MS = 500;
export const STUDIO_PANELS = ['colors', 'wallpaper', 'icons', 'widgets', 'type'] as const;
export type StudioPanel = (typeof STUDIO_PANELS)[number];
export type StudioWorkspacePanel = StudioPanel | 'details';
export interface CreatorStudioOptions {
  details: ReactNode;
  wallpaperTools: (target: WallpaperTarget) => ReactNode;
  onSave: () => void;
  busy: boolean;
  saveDisabled?: boolean;
  labels?: { save: string; details: string };
  showIcons?: boolean;
  actions?: ReactNode;
}

export type WallpaperTarget = 'home' | 'lock';
export type PaletteRole = Exclude<keyof Palette, 'mode'>;
export type PalettePreset = Omit<Palette, 'inkMuted'> & { inkMuted?: string };
export type WallpaperPatch = {
  [Kind in WallpaperSpec['kind']]: Partial<Omit<Extract<WallpaperSpec, { kind: Kind }>, 'kind'>>;
}[WallpaperSpec['kind']];

export type EditorAction =
  | { type: 'setPaletteRole'; role: PaletteRole; value: string }
  | { type: 'applyPalettePreset'; palette: PalettePreset }
  | { type: 'setWallpaper'; kind: GeneratedWallpaperKind; target?: WallpaperTarget }
  | {
      type: 'setPhotoWallpaper';
      assetKey: string;
      target?: WallpaperTarget;
      palette?: Palette;
      icons?: IconStyle;
    }
  | { type: 'patchWallpaper'; patch: WallpaperPatch; target?: WallpaperTarget; control?: string }
  | { type: 'shuffleSeed'; seed?: number; target?: WallpaperTarget }
  | { type: 'setLockMode'; mode: 'same' | 'variant' }
  | { type: 'patchIcons'; patch: Partial<IconStyle>; control?: string }
  | { type: 'patchWidgets'; patch: Partial<ThemeSpec['widgets']>; control?: string }
  | { type: 'setFont'; role: 'display' | 'body'; font: FontId }
  | { type: 'setDecor'; decor: string[] }
  | { type: 'undo' | 'redo' | 'reset' }
  | { type: 'load'; spec: ThemeSpec }
  | { type: 'replaceSpec'; spec: ThemeSpec };

export type TimedEditorAction = EditorAction & { at: number };
export type EditorError = 'VALIDATION' | null;

export interface StudioPanelProps {
  spec: ThemeSpec;
  onChange: (action: EditorAction) => void;
}

export interface WallpaperPanelProps extends StudioPanelProps {
  photoTools?: (target: WallpaperTarget) => ReactNode;
}

export interface ThemeEditorState {
  spec: ThemeSpec;
  initialSpec: ThemeSpec;
  past: readonly ThemeSpec[];
  future: readonly ThemeSpec[];
  error: EditorError;
  lastEdit: { control: string; at: number } | null;
}

export interface ThemeEditor {
  spec: ThemeSpec;
  dispatch: (action: EditorAction) => void;
  canUndo: boolean;
  canRedo: boolean;
  error: EditorError;
  clearError: () => void;
  flushDraft: () => void;
}

export interface StudioDraft {
  v: 1;
  spec: ThemeSpec;
  sourceSlug: string | null;
}

export type StudioShareResult =
  { ok: true; url: string } | { ok: false; reason: 'photo' | 'too-large' | 'invalid' };
