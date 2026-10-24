import type { CollectionCardDTO } from './dto';

export interface HomeCollectionCandidate extends CollectionCardDTO {
  descriptionEn: string | null;
  descriptionAr: string | null;
  isPinned: boolean;
  startsAt: string | null;
  endsAt: string | null;
}
/** Start is inclusive and end exclusive; the caller supplies its request time. */
export function collectionIsInWindow(collection: HomeCollectionCandidate, now: number): boolean {
  if (!Number.isFinite(now)) throw new RangeError('A finite request timestamp is required');
  if (collection.kind === 'user') return false;
  return (
    collection.kind !== 'seasonal' ||
    ((!collection.startsAt || Date.parse(collection.startsAt) <= now) &&
      (!collection.endsAt || Date.parse(collection.endsAt) > now))
  );
}
export function selectHomeHero(
  candidates: readonly HomeCollectionCandidate[],
  selectedSlug: string | null,
  now: number,
): HomeCollectionCandidate | null {
  const eligible = candidates.filter((collection) => collectionIsInWindow(collection, now));
  return (
    eligible.find((collection) => collection.slug === selectedSlug) ??
    eligible.find((collection) => collection.isPinned) ??
    null
  );
}
export function selectHomeCollections(
  candidates: readonly HomeCollectionCandidate[],
  now: number,
): HomeCollectionCandidate[] {
  return candidates.filter(
    (collection) =>
      collectionIsInWindow(collection, now) &&
      (collection.isPinned || collection.kind === 'seasonal'),
  );
}
