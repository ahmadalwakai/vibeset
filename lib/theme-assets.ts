export type WallpaperSize = 'phone' | 'tablet' | 'desktop';
export interface WallpaperAsset {
  key: string;
  w: number;
  h: number;
  bytes: number;
}
export interface ThemeAssets {
  version: number;
  thumb: string;
  previewHome: string;
  previewLock: string;
  og: string;
  wallpapers: Partial<Record<WallpaperSize, WallpaperAsset>>;
}
