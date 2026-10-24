import type { AppDTO } from '../dto';
import type { WallpaperSpec } from '../render/spec';
import type { GlyphWeight } from '../render/types';
import { appSlugSchema, exportSlugSchema } from '../validation/icon-export';

export { chunk } from './share';

export function defaultSelection(apps: readonly AppDTO[]): string[] {
  return [...apps]
    .sort(
      (left, right) =>
        left.rank - right.rank || (left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0),
    )
    .slice(0, 24)
    .map((app) => app.slug);
}

export function fileNameFor(slug: string, appSlug: string): string {
  const fileName = `vibeset-${exportSlugSchema.parse(slug)}-${appSlugSchema.parse(appSlug)}.png`;
  if (fileName.length > 255) throw new RangeError('Export filename is too long');
  return fileName;
}

function fold(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}|\u0640/gu, '')
    .toLocaleLowerCase('en')
    .trim();
}

export function matchesSearch(app: AppDTO, query: string): boolean {
  const tokens = fold(query).split(/\s+/u).filter(Boolean);
  if (!tokens.length) return true;
  const fields = [app.name, app.slug, ...app.aliases].map(fold);
  return tokens.every((token) => fields.some((field) => field.includes(token)));
}

export function wallpaperGlyphWeights(wallpaper: WallpaperSpec): GlyphWeight[] {
  if (wallpaper.kind === 'scatter') return [wallpaper.weight];
  if (wallpaper.kind === 'pattern' && ['hearts', 'stars'].includes(wallpaper.pattern))
    return ['fill'];
  return [];
}
