import type { ThemeSpec } from './render/spec';
import type { ThemeSource, ThemeStatus } from './theme-status';

export type CreatorStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export interface CreatorLink {
  label: string;
  url: string;
}
export interface CreatorContext {
  userId: string;
  handle: string;
  displayName: string;
  bio: string | null;
  links: CreatorLink[];
  avatarUrl: string | null;
  status: CreatorStatus;
  isAdult: boolean;
  rejectionReason: string | null;
  appliedAt: string;
  reviewedAt: string | null;
  updatedAt: string;
}
export interface CreatorThemeSummary {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string | null;
  status: ThemeStatus;
  source: ThemeSource;
  thumbUrl: string | null;
  rejectionReason: string | null;
  updatedAt: string;
  createdAt: string;
}
export interface CreatorThemeEditorDTO extends CreatorThemeSummary {
  spec: ThemeSpec;
  descriptionEn: string | null;
  descriptionAr: string | null;
  tagSlugs: string[];
}
export interface CreatorStats {
  views: number;
  downloads: number;
  iconExports: number;
  remixes: number;
  setupCompletions: number;
}
export interface CreatorDashboard {
  counts: Record<ThemeStatus, number>;
  currentFavorites: number;
  days: 7 | 30;
  stats: CreatorStats;
  topThemes: CreatorThemeSummary[];
  latestRejections: CreatorThemeSummary[];
}
