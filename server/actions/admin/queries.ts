'use server';

import type {
  AdminPage,
  AdminReviewItem,
  AdminReviewPage,
  AdminThemeRow,
} from '../../../lib/admin';
import type { ActionResult } from '../../../lib/result';
import {
  adminPublishQuerySchema,
  adminReviewQuerySchema,
  adminThemeReadSchema,
} from '../../../lib/validation/admin-queries';

export async function refreshAdminReviewItem(
  raw: unknown,
): Promise<ActionResult<AdminReviewItem | null>> {
  const { createAction } = await import('../../action');
  return createAction({
    input: adminThemeReadSchema,
    auth: 'admin',
    handler: async (input) =>
      (await import('../../admin-queries/review')).getAdminReviewItem(input.id),
  })(raw);
}

export async function refreshAdminReview(raw: unknown): Promise<ActionResult<AdminReviewPage>> {
  const { createAction } = await import('../../action');
  return createAction({
    input: adminReviewQuerySchema,
    auth: 'admin',
    handler: async (input) => (await import('../../admin-queries/review')).listAdminReview(input),
  })(raw);
}

export async function refreshAdminPublish(
  raw: unknown,
): Promise<ActionResult<AdminPage<AdminThemeRow>>> {
  const { createAction } = await import('../../action');
  return createAction({
    input: adminPublishQuerySchema,
    auth: 'admin',
    handler: async (input) => (await import('../../admin-queries/publish')).listAdminPublish(input),
  })(raw);
}
