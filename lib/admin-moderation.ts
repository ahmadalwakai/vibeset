import type { CreatorStatus } from './creator';
import type { ThemeSpec } from './render/spec';
import type { ThemeStatus } from './theme-status';
import type { ReportReason } from './validation/reports';

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  createdAt: string;
  creator: { handle: string; status: CreatorStatus } | null;
}
export interface AdminUserDetail extends AdminUserRow {
  emailVerified: boolean;
  locale: string;
  counts: { favorites: number; collections: number; remixes: number; themes: number };
}
export interface AdminCreatorRow {
  userId: string;
  email: string;
  accountCreatedAt: string;
  banned: boolean;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  links: { label: string; url: string }[];
  isAdult: boolean;
  status: CreatorStatus;
  appliedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  themeCount: number;
  publishedCount: number;
  downloads30d: number;
}
export interface AdminReportRow {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  reporter: { id: string; maskedEmail: string } | null;
  theme: {
    id: string;
    slug: string;
    nameEn: string;
    nameAr: string | null;
    status: ThemeStatus;
    ownerId: string | null;
    thumbUrl: string | null;
    previewHomeUrl: string | null;
    previewLockUrl: string | null;
  };
}
export interface AdminReportDetail extends AdminReportRow {
  themeSpec: ThemeSpec;
  otherReports: AdminReportRow[];
}
export interface ModerationResult {
  ok: true;
  archived: number;
}
export interface CreatorReviewResult {
  status: CreatorStatus;
  archived: number;
}
