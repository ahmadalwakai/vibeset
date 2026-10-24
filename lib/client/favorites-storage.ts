import { FAVORITES_KEY, MAX_FAVORITES_STORAGE_LENGTH } from '../favorites';
import { localFavoriteIdsSchema } from '../validation/favorites';

let volatileIds: string[] = [];
let writeFailed = false;
let failedBase: string | null | undefined;

export function readLocalFavorites(): string[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(FAVORITES_KEY);
  } catch {
    return [...volatileIds];
  }
  if (writeFailed && (failedBase === undefined || raw === failedBase)) return [...volatileIds];
  writeFailed = false;
  if (!raw || raw.length > MAX_FAVORITES_STORAGE_LENGTH) {
    volatileIds = [];
    return [];
  }
  try {
    const value: unknown = JSON.parse(raw);
    const parsed = localFavoriteIdsSchema.safeParse(value);
    volatileIds = parsed.success ? parsed.data : [];
  } catch {
    volatileIds = [];
  }
  return [...volatileIds];
}

export function writeLocalFavorites(ids: readonly string[]): void {
  const parsed = localFavoriteIdsSchema.parse(ids);
  const serialized = JSON.stringify(parsed);
  if (serialized.length > MAX_FAVORITES_STORAGE_LENGTH)
    throw new RangeError('Favorites are too large');
  volatileIds = parsed;
  try {
    failedBase = localStorage.getItem(FAVORITES_KEY);
  } catch {
    failedBase = undefined;
  }
  try {
    localStorage.setItem(FAVORITES_KEY, serialized);
  } catch {
    writeFailed = true;
    return;
  }
  writeFailed = false;
}

/** Preserve additions made in another tab while the submitted merge was in flight. */
export function removeMergedLocalFavorites(submitted: readonly string[]): void {
  const merged = new Set(localFavoriteIdsSchema.parse(submitted));
  writeLocalFavorites(readLocalFavorites().filter((id) => !merged.has(id)));
}
