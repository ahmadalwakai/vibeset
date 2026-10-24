import type { ThemeSpec } from './render/spec';

export interface StudioSource {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string | null;
}
export interface StudioEntryProps {
  initialSpec: ThemeSpec;
  source: StudioSource | null;
  sourceSlug: string | null;
  explicit: boolean;
  entryError: 'invalidLink' | 'themeUnavailable' | null;
}
