'use server';

import type {
  AdminGenerationRunDetail,
  AdminGenerationSummary,
} from '../../../lib/admin-operations';
import type { ActionResult } from '../../../lib/result';
import {
  adminGenerateDraftsSchema,
  adminGenerationReadSchema,
} from '../../../lib/validation/admin-operations';

export async function adminGenerateDrafts(
  raw: unknown,
): Promise<ActionResult<AdminGenerationSummary>> {
  const { createAction } = await import('../../action');
  return createAction({
    input: adminGenerateDraftsSchema,
    auth: 'admin',
    handler: async (input, context) => {
      const { getRecipe } = await import('../../../content/aesthetics');
      if (!getRecipe(input.aesthetic))
        throw new (await import('../../errors')).AppError('VALIDATION');
      const { randomInt } = await import('node:crypto');
      const { generateDrafts } = await import('../../services/theme-generate');
      const result = await generateDrafts({
        ...input,
        seed: input.seed ?? randomInt(2_147_483_648),
        actor: { kind: 'user', userId: context.user.id, role: 'admin', isCreator: false },
      });
      if (result.tags.length) (await import('../../cache')).invalidate(result.tags, 'update');
      return result.data;
    },
  })(raw);
}
export async function adminReadGenerationRun(
  raw: unknown,
): Promise<ActionResult<AdminGenerationRunDetail | null>> {
  const { createAction } = await import('../../action');
  return createAction({
    input: adminGenerationReadSchema,
    auth: 'admin',
    handler: async ({ id }) =>
      (await import('../../admin-queries/generator')).getAdminGenerationRun(id),
  })(raw);
}
