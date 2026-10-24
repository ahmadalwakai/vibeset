import type { WallpaperDownloadDTO } from './dto';
import type { ThemeSpec } from './render/spec';

/** Published details and local Studio designs share the same export surfaces. */
export interface ThemeExportSource {
  id?: string;
  slug: string;
  spec: ThemeSpec;
  /** Omit for a local design; every preset is then rendered from the current spec. */
  wallpapers?: readonly WallpaperDownloadDTO[];
}
