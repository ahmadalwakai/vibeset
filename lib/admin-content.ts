import type { AdminPage } from './admin';
import type { TagKind } from './dto';
import type { ThemeStatus } from './theme-status';

export const MAX_ADMIN_COLLECTION_ITEMS = 500;
export const APP_CATEGORIES = [
  'social',
  'messaging',
  'media',
  'music',
  'photo',
  'productivity',
  'ai',
  'shopping',
  'finance',
  'travel',
  'food',
  'health',
  'education',
  'games',
  'utilities',
  'system',
  'news',
  'lifestyle',
] as const;
export type AppCategory = (typeof APP_CATEGORIES)[number];
export interface AdminCollection {
  id: string;
  slug: string;
  kind: 'editorial' | 'seasonal';
  visibility: 'public' | 'private';
  titleEn: string;
  titleAr: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  coverThemeId: string | null;
  coverThumbUrl: string | null;
  isPinned: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  itemCount: number;
  publishedCount: number;
  updatedAt: string;
}
export interface AdminCollectionItem {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string | null;
  status: ThemeStatus;
  thumbUrl: string | null;
  position: number;
}
export interface AdminCollectionDetail extends AdminCollection {
  items: AdminCollectionItem[];
}
export interface AdminContentTag {
  id: string;
  slug: string;
  kind: TagKind;
  nameEn: string;
  nameAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  sortOrder: number;
  isActive: boolean;
  usageCount: number;
  isSeeded: boolean;
}
export interface AdminApp {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  category: AppCategory;
  glyph: string;
  iosScheme: string | null;
  androidPackage: string | null;
  rank: number;
  isActive: boolean;
}
export type AdminCollectionPage = AdminPage<AdminCollection>;
export type AdminAppPage = AdminPage<AdminApp>;
export interface AdminThemeChoice {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string | null;
  thumbUrl: string | null;
}
