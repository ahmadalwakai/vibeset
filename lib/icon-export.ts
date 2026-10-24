import type { AppDTO } from './dto';
import type { IconStyle, ThemeSpec } from './render/spec';
import type { GlyphSource, RenderResult } from './render/types';

export const MAX_SELECTED_APPS = 125;
export const MAX_CUSTOM_ICONS = 20;
export const MAX_ICON_EXPORT_FILES = MAX_SELECTED_APPS + MAX_CUSTOM_ICONS + 4;
export const MAX_ICON_EXPORT_BYTES = 64 * 1024 * 1024;
export const ICON_SELECTION_KEY = 'vibeset:selected-apps';

export interface CustomIcon {
  id: string;
  label: string;
  glyph: string;
}

export interface GlyphManifestEntry {
  name: string;
  categories: string[];
  tags: string[];
}

export interface IconSelection {
  v: 1;
  appSlugs: string[];
  custom: CustomIcon[];
}

export interface ExportProgress {
  completed: number;
  total: number;
}

export type IconExportWarning = 'photo-wallpaper-fallback' | 'missing-glyph';

export interface IconRenderContext {
  spec: ThemeSpec;
  icons: IconStyle;
  glyphs: GlyphSource;
  wallpaper?: RenderResult;
  warnings: readonly IconExportWarning[];
}

export interface ExportIconsInput {
  slug: string;
  spec: ThemeSpec;
  apps: readonly AppDTO[];
  custom: readonly CustomIcon[];
  platform: 'ios' | 'shaped';
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
  onWarning?: (warning: IconExportWarning) => void;
  decor?: boolean;
}
