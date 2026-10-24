import type { ColorFamily } from './catalog';
import type { TaxonomyType } from './generator';
import type { ThemeSpec } from './render/spec';
import type { Settings } from './settings';

export type { Locale } from 'next-intl';
export type { ColorFamily } from './catalog';
export type ThemeSort = 'trending' | 'new' | 'popular';
export type TagKind = TaxonomyType;

export interface TagDTO {
  slug: string;
  kind: TagKind;
  nameEn: string;
  nameAr: string;
}

export interface CreatorMiniDTO {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ThemeCardDTO {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string | null;
  thumbUrl: string | null;
  dominantColor: string | null;
  tags: TagDTO[];
  isFeatured: boolean;
  downloadCount: number;
  favoriteCount: number;
  creator: CreatorMiniDTO | null;
  publishedAt: string | null;
}

export interface WallpaperDownloadDTO {
  size: 'phone' | 'tablet' | 'desktop';
  url: string;
  w: number;
  h: number;
  bytes: number;
}

export interface ThemeDetailDTO extends ThemeCardDTO {
  descriptionEn: string | null;
  descriptionAr: string | null;
  spec: ThemeSpec;
  previewHomeUrl: string | null;
  previewLockUrl: string | null;
  ogUrl: string | null;
  wallpapers: WallpaperDownloadDTO[];
  remixOf: { slug: string; nameEn: string; nameAr: string | null } | null;
}

export interface CollectionCardDTO {
  id: string;
  slug: string | null;
  kind: 'editorial' | 'seasonal' | 'user';
  titleEn: string;
  titleAr: string | null;
  coverThumbUrl: string | null;
  itemCount: number;
}

export interface CollectionDetailDTO extends CollectionCardDTO {
  descriptionEn: string | null;
  descriptionAr: string | null;
  items: Paginated<ThemeCardDTO>;
}

export interface AppDTO {
  slug: string;
  name: string;
  aliases: string[];
  category: string;
  glyph: string;
  rank: number;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ThemeListQuery {
  ids?: string[];
  q?: string;
  tags?: string[];
  color?: ColorFamily;
  sort: ThemeSort;
  cursor?: string | null;
  limit: number;
}

/** Page data extends public DTOs without changing the v1 API contracts. */
export interface AestheticTagDTO extends TagDTO {
  descriptionEn: string | null;
  descriptionAr: string | null;
}

export interface CreatorPublicDTO extends CreatorMiniDTO {
  bio: string | null;
  links: { label: string; url: string }[];
  themes: Paginated<ThemeCardDTO>;
}

export interface PublicSettingsDTO {
  announcement: (Settings['home.announcement'] & { id: string }) | null;
  heroCollectionSlug: string | null;
}
