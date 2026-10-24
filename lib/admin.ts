import type { ColorFamily } from './catalog';
import type { TagDTO, WallpaperDownloadDTO } from './dto';
import type { ThemeSpec } from './render/spec';
import type { ThemeAssets } from './theme-assets';
import type { ThemeSource, ThemeStatus } from './theme-status';

export interface AdminCounts {
  pendingReview: number;
  openReports: number;
  pendingCreators: number;
}
export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  nextPage: number | null;
}
export interface AdminTagDTO extends TagDTO {
  id: string;
  isActive: boolean;
}
export interface AdminThemeOwner {
  id: string;
  name: string;
  handle: string | null;
  creatorStatus: 'pending' | 'approved' | 'rejected' | 'suspended' | null;
}
export interface AdminThemeRow {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string | null;
  status: ThemeStatus;
  source: ThemeSource;
  thumbUrl: string | null;
  isFeatured: boolean;
  stale: boolean;
  specHash: string;
  assetsSpecHash: string | null;
  assetVersion: number;
  publishError: string | null;
  generationRunId: string | null;
  colorFamily: ColorFamily | null;
  downloadCount: number;
  favoriteCount: number;
  popularity: number;
  owner: AdminThemeOwner | null;
  tags: AdminTagDTO[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}
export interface AdminAuditEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}
export interface AdminDownloadPoint {
  day: string;
  downloads: number;
}
export interface AdminThemeStatsPoint extends AdminDownloadPoint {
  views: number;
  iconExports: number;
  remixes: number;
  setupCompletions: number;
}
export interface AdminThemeEditorDTO extends AdminThemeRow {
  spec: ThemeSpec;
  descriptionEn: string | null;
  descriptionAr: string | null;
  assets: ThemeAssets | null;
  previewHomeUrl: string | null;
  previewLockUrl: string | null;
  ogUrl: string | null;
  wallpapers: WallpaperDownloadDTO[];
  rejectionReason: string | null;
  history: AdminAuditEntry[];
  stats: AdminThemeStatsPoint[];
}
export interface AdminQaSummary {
  ok: boolean;
  reasons: string[];
  minIconContrast: number;
}
export interface AdminDuplicateSummary {
  id: string;
  nameEn: string;
  nameAr: string | null;
  distance: number;
}
export interface AdminReviewItem extends AdminThemeRow {
  reviewVersion: string;
  spec: ThemeSpec;
  qa: AdminQaSummary;
  nearestDuplicate: AdminDuplicateSummary | null;
}
export interface AdminReviewPage extends AdminPage<AdminReviewItem> {
  nextCursor: string | null;
}
export interface AdminDashboardKpis extends AdminCounts {
  published: number;
  approvedUnpublished: number;
  stale: number;
  downloadsToday: number;
  downloads7d: number;
  downloads30d: number;
  newUsers7d: number;
}
export interface AdminTopTheme {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string | null;
  status: ThemeStatus;
  thumbUrl: string | null;
  downloads: number;
}
export interface AdminThemeOptions {
  tags: AdminTagDTO[];
  collections: { id: string; titleEn: string; titleAr: string | null }[];
  runs: { id: string; aesthetic: string; startedAt: string }[];
}
