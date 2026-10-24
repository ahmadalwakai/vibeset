'use server';

import type { z } from 'zod';
import type { ActionContext } from '../../../lib/auth';
import type {
  AdminThemeBulkData,
  AdminThemeCleanup,
  AdminThemeUpdateData,
} from '../../../lib/admin-themes';
import type { ActionResult } from '../../../lib/result';
import type { Actor } from '../../../lib/theme-status';
import {
  adminAddToCollectionSchema,
  adminDeleteThemesSchema,
  adminSetFeaturedSchema,
  adminTagThemesSchema,
  adminTransitionThemesSchema,
  adminUpdateThemeSchema,
} from '../../../lib/validation/admin-themes';

function actor(context: ActionContext<'admin'>): Actor {
  return { kind: 'user', userId: context.user.id, role: 'admin', isCreator: false };
}
async function action<Schema extends z.ZodType, T>(
  raw: unknown,
  input: Schema,
  handler: (
    input: z.output<Schema>,
    actor: Actor,
  ) => Promise<{ data: T; tags: string[]; cleanup?: AdminThemeCleanup }>,
): Promise<ActionResult<T>> {
  const { createAction } = await import('../../action');
  return createAction({
    input,
    auth: 'admin',
    handler: async (value, context) => {
      const result = await handler(value, actor(context));
      if (result.cleanup?.themeIds.length) {
        const ids = result.cleanup.themeIds;
        try {
          const { after } = await import('next/server');
          after(async () => {
            try {
              await (await import('../../services/admin-themes')).cleanupDeletedThemeAssets(ids);
            } catch {
              console.error({ scope: 'admin.theme.cleanup', failed: true });
            }
          });
        } catch {
          console.error({ scope: 'admin.theme.cleanup-scheduling', failed: true });
        }
      }
      if (result.tags.length) (await import('../../cache')).invalidate(result.tags, 'update');
      return result.data;
    },
  })(raw);
}
export async function adminUpdateTheme(raw: unknown): Promise<ActionResult<AdminThemeUpdateData>> {
  return action(raw, adminUpdateThemeSchema, async (input, principal) =>
    (await import('../../services/admin-themes')).adminUpdateTheme(input, principal),
  );
}
export async function adminTransitionThemes(
  raw: unknown,
): Promise<ActionResult<AdminThemeBulkData>> {
  return action(raw, adminTransitionThemesSchema, async (input, principal) =>
    (await import('../../services/admin-themes')).adminTransitionThemes(input, principal),
  );
}
export async function adminSetFeatured(raw: unknown): Promise<ActionResult<AdminThemeBulkData>> {
  return action(raw, adminSetFeaturedSchema, async (input, principal) =>
    (await import('../../services/admin-themes')).adminSetFeatured(input, principal),
  );
}
export async function adminTagThemes(raw: unknown): Promise<ActionResult<AdminThemeBulkData>> {
  return action(raw, adminTagThemesSchema, async (input, principal) =>
    (await import('../../services/admin-themes')).adminTagThemes(input, principal),
  );
}
export async function adminAddToCollection(
  raw: unknown,
): Promise<ActionResult<AdminThemeBulkData>> {
  return action(raw, adminAddToCollectionSchema, async (input, principal) =>
    (await import('../../services/admin-themes')).adminAddToCollection(input, principal),
  );
}
export async function adminDeleteThemes(raw: unknown): Promise<ActionResult<AdminThemeBulkData>> {
  return action(raw, adminDeleteThemesSchema, async (input, principal) =>
    (await import('../../services/admin-themes')).adminDeleteThemes(input, principal),
  );
}
