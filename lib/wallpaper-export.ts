import type { WallpaperDownloadDTO } from './dto';

export const MAX_WALLPAPER_PIXELS = 16_700_000;
export const MAX_WALLPAPER_SIDE = 16_384;
export const MAX_WALLPAPER_BYTES = 32 * 1024 * 1024;
export type WallpaperSize = WallpaperDownloadDTO['size'] | 'desktop4k' | 'screen';

export interface WallpaperDimensions {
  w: number;
  h: number;
}

export interface ScreenSizeInput {
  width: number;
  height: number;
  pixelRatio: number;
}

export type WallpaperOption =
  | { kind: 'cdn'; asset: WallpaperDownloadDTO }
  | ({ kind: 'render'; size: WallpaperSize } & WallpaperDimensions);
