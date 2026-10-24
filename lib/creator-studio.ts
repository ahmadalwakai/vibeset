import type { CreatorThemeEditorDTO } from './creator';
import type { TagDTO } from './dto';

export interface CreatorThemeDetails {
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  aesthetic: string;
  tags: string[];
}

/** Inactive taxonomy entries cannot remain hidden, unremovable form selections. */
export function creatorDetailsFromTheme(
  theme: CreatorThemeEditorDTO | undefined,
  tags: readonly TagDTO[],
): CreatorThemeDetails {
  return {
    nameEn: theme?.nameEn ?? '',
    nameAr: theme?.nameAr ?? '',
    descriptionEn: theme?.descriptionEn ?? '',
    descriptionAr: theme?.descriptionAr ?? '',
    aesthetic:
      theme?.tagSlugs.find((slug) =>
        tags.some((tag) => tag.slug === slug && tag.kind === 'aesthetic'),
      ) ?? '',
    tags:
      theme?.tagSlugs.filter((slug) =>
        tags.some((tag) => tag.slug === slug && tag.kind !== 'aesthetic'),
      ) ?? [],
  };
}
