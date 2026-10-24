import 'server-only';

import { z } from 'zod';
import type { apps } from '../../db/schema/catalog';
import type { collections } from '../../db/schema/collections';
import type { creatorProfiles } from '../../db/schema/moderation';
import type { tags } from '../../db/schema/taxonomy';
import type { themes } from '../../db/schema/themes';
import type {
  AestheticTagDTO,
  AppDTO,
  CollectionCardDTO,
  CreatorMiniDTO,
  CreatorPublicDTO,
  Paginated,
  TagDTO,
  ThemeCardDTO,
  ThemeDetailDTO,
} from '../../lib/dto';
import { themeSpecSchema } from '../../lib/render/spec';
import { cdnUrl } from '../storage/urls';

type ThemeRow = typeof themes.$inferSelect;
export type TagRow = Pick<typeof tags.$inferSelect, 'slug' | 'kind' | 'nameEn' | 'nameAr'>;
export type CreatorMiniRow = Pick<
  typeof creatorProfiles.$inferSelect,
  'handle' | 'displayName' | 'avatarKey'
>;
export type ThemeCardSource = Pick<
  ThemeRow,
  | 'id'
  | 'slug'
  | 'nameEn'
  | 'nameAr'
  | 'assets'
  | 'dominantColor'
  | 'isFeatured'
  | 'downloadCount'
  | 'favoriteCount'
  | 'publishedAt'
>;
export type ThemeCardRow = ThemeCardSource & { tags: TagRow[]; creator: CreatorMiniRow | null };
export type ThemeDetailRow = ThemeCardRow &
  Pick<ThemeRow, 'descriptionEn' | 'descriptionAr' | 'spec' | 'updatedAt'> & {
    remixOf: Pick<ThemeRow, 'slug' | 'nameEn' | 'nameAr'> | null;
  };
export type CollectionCardRow = Pick<
  typeof collections.$inferSelect,
  'id' | 'slug' | 'kind' | 'titleEn' | 'titleAr'
> & { coverThumbKey: string | null; itemCount: number };
export type AppRow = Pick<
  typeof apps.$inferSelect,
  'slug' | 'name' | 'aliases' | 'category' | 'glyph' | 'rank'
>;

export function toTag(row: TagRow): TagDTO {
  return { slug: row.slug, kind: row.kind, nameEn: row.nameEn, nameAr: row.nameAr };
}

export function toAestheticTag(
  row: TagRow & { descriptionEn: string | null; descriptionAr: string | null },
): AestheticTagDTO {
  return { ...toTag(row), descriptionEn: row.descriptionEn, descriptionAr: row.descriptionAr };
}

export function toCreatorMini(row: CreatorMiniRow): CreatorMiniDTO {
  return {
    handle: row.handle,
    displayName: row.displayName,
    avatarUrl: row.avatarKey ? cdnUrl(row.avatarKey) : null,
  };
}

const publicLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: z.url({ protocol: /^https?$/ }).refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password;
  }),
});

export function toCreatorPublic(
  row: CreatorMiniRow & Pick<typeof creatorProfiles.$inferSelect, 'bio' | 'links'>,
  page: Paginated<ThemeCardDTO>,
): CreatorPublicDTO {
  const links = row.links.flatMap((value) => {
    const parsed = publicLinkSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  return { ...toCreatorMini(row), bio: row.bio, links: links.slice(0, 3), themes: page };
}

export function toThemeCard(row: ThemeCardRow): ThemeCardDTO {
  return {
    id: row.id,
    slug: row.slug,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    thumbUrl: row.assets ? cdnUrl(row.assets.thumb) : null,
    dominantColor: row.dominantColor,
    tags: row.tags.map(toTag),
    isFeatured: row.isFeatured,
    downloadCount: row.downloadCount,
    favoriteCount: row.favoriteCount,
    creator: row.creator ? toCreatorMini(row.creator) : null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

export function toThemeDetail(row: ThemeDetailRow): ThemeDetailDTO {
  const assets = row.assets;
  return {
    ...toThemeCard(row),
    descriptionEn: row.descriptionEn,
    descriptionAr: row.descriptionAr,
    updatedAt: row.updatedAt.toISOString(),
    spec: themeSpecSchema.parse(row.spec),
    previewHomeUrl: assets ? cdnUrl(assets.previewHome) : null,
    previewLockUrl: assets ? cdnUrl(assets.previewLock) : null,
    ogUrl: assets ? cdnUrl(assets.og) : null,
    wallpapers: (['phone', 'tablet', 'desktop'] as const).flatMap((size) => {
      const asset = assets?.wallpapers[size];
      return asset
        ? [{ size, url: cdnUrl(asset.key), w: asset.w, h: asset.h, bytes: asset.bytes }]
        : [];
    }),
    remixOf: row.remixOf
      ? { slug: row.remixOf.slug, nameEn: row.remixOf.nameEn, nameAr: row.remixOf.nameAr }
      : null,
  };
}

export function toCollectionCard(row: CollectionCardRow): CollectionCardDTO {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    titleEn: row.titleEn,
    titleAr: row.titleAr,
    coverThumbUrl: row.coverThumbKey ? cdnUrl(row.coverThumbKey) : null,
    itemCount: row.itemCount,
  };
}

export function toApp(row: AppRow): AppDTO {
  return {
    slug: row.slug,
    name: row.name,
    aliases: [...row.aliases],
    category: row.category,
    glyph: row.glyph,
    rank: row.rank,
  };
}
