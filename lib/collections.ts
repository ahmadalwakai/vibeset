import type { ThemeCardDTO } from './dto';

export const MAX_USER_COLLECTIONS = 100;
export const MAX_COLLECTION_ITEMS = 500;
export type UserCollectionVisibility = 'private' | 'unlisted';
export interface UserCollectionSummary {
  id: string;
  titleEn: string;
  visibility: UserCollectionVisibility;
  itemCount: number;
  coverThumbUrl: string | null;
  containsTheme: boolean;
}
export interface UserCollectionDetail extends UserCollectionSummary {
  canEdit: boolean;
  items: ThemeCardDTO[];
}
