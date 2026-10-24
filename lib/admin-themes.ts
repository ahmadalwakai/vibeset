import type { ErrorCode } from './result';
import type { ThemeStatus } from './theme-status';

export interface AdminReviewVersionInput {
  status: ThemeStatus;
  revisionTime: string;
  specHash: string;
}

export const ADMIN_BULK_TARGETS = ['approved', 'rejected', 'archived', 'draft'] as const;
export type AdminBulkTarget = (typeof ADMIN_BULK_TARGETS)[number];
export interface AdminThemeBulkItem {
  id: string;
  ok: boolean;
  code?: ErrorCode;
}
export interface AdminThemeBulkData {
  count: number;
  results: AdminThemeBulkItem[];
}
export interface AdminThemeUpdateData {
  id: string;
  stale: boolean;
}
export interface AdminThemeCleanup {
  themeIds: string[];
}
