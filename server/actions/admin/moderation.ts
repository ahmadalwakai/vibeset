'use server';

import type { z } from 'zod';
import type { ActionContext } from '../../../lib/auth';
import type {
  AdminCreatorRow,
  AdminReportDetail,
  AdminUserDetail,
  CreatorReviewResult,
  ModerationResult,
} from '../../../lib/admin-moderation';
import type { ActionResult } from '../../../lib/result';
import type { Actor } from '../../../lib/theme-status';
import {
  adminBanUserSchema,
  adminReportReadSchema,
  adminResolveReportSchema,
  adminReviewCreatorSchema,
  adminSetRoleSchema,
  adminUnbanUserSchema,
  adminUserReadSchema,
} from '../../../lib/validation/admin-moderation';

async function action<Schema extends z.ZodType, T>(
  raw: unknown,
  input: Schema,
  handler: (input: z.output<Schema>, actor: Actor) => Promise<{ data: T; tags: string[] }>,
): Promise<ActionResult<T>> {
  const { createAction } = await import('../../action');
  return createAction({
    input,
    auth: 'admin',
    handler: async (value, context: ActionContext<'admin'>) => {
      const result = await handler(value, {
        kind: 'user',
        userId: context.user.id,
        role: 'admin',
        isCreator: false,
      });
      if (result.tags.length) (await import('../../cache')).invalidate(result.tags, 'update');
      return result.data;
    },
  })(raw);
}
export async function adminSetRole(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  return action(raw, adminSetRoleSchema, async (input, actor) =>
    (await import('../../services/users')).adminSetRole(input, actor),
  );
}
export async function adminBanUser(raw: unknown): Promise<ActionResult<ModerationResult>> {
  return action(raw, adminBanUserSchema, async (input, actor) =>
    (await import('../../services/users')).adminBanUser(input, actor),
  );
}
export async function adminUnbanUser(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  return action(raw, adminUnbanUserSchema, async (input, actor) =>
    (await import('../../services/users')).adminUnbanUser(input, actor),
  );
}
export async function adminReviewCreator(raw: unknown): Promise<ActionResult<CreatorReviewResult>> {
  return action(raw, adminReviewCreatorSchema, async (input, actor) =>
    (await import('../../services/creators')).reviewCreator(input, actor),
  );
}
export async function adminResolveReport(raw: unknown): Promise<ActionResult<ModerationResult>> {
  return action(raw, adminResolveReportSchema, async (input, actor) =>
    (await import('../../services/admin-reports')).resolveReport(input, actor),
  );
}
export async function readAdminUser(raw: unknown): Promise<ActionResult<AdminUserDetail | null>> {
  return action(raw, adminUserReadSchema, async (input) => ({
    data: await (await import('../../admin-queries/users')).getAdminUser(input.userId),
    tags: [],
  }));
}
export async function readAdminCreator(
  raw: unknown,
): Promise<ActionResult<AdminCreatorRow | null>> {
  return action(raw, adminUserReadSchema, async (input) => ({
    data: await (await import('../../admin-queries/creators')).getAdminCreator(input.userId),
    tags: [],
  }));
}
export async function readAdminReport(
  raw: unknown,
): Promise<ActionResult<AdminReportDetail | null>> {
  return action(raw, adminReportReadSchema, async (input) => ({
    data: await (await import('../../admin-queries/reports')).getAdminReport(input.id),
    tags: [],
  }));
}
