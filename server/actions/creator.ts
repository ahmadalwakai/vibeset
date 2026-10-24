'use server';

import type { z } from 'zod';
import type { ActionContext } from '../../lib/auth';
import type { ActionResult } from '../../lib/result';
import type { Actor, ThemeStatus } from '../../lib/theme-status';
import type { CreatorStatus } from '../../lib/creator';
import {
  applyForCreatorSchema,
  checkHandleSchema,
  updateCreatorProfileSchema,
  createCreatorThemeSchema,
  updateCreatorThemeSchema,
  creatorThemeIdSchema,
} from '../../lib/validation/creator';

function actor(context: ActionContext<'user' | 'creator'>): Actor {
  return {
    kind: 'user',
    userId: context.user.id,
    role: context.user.role === 'admin' ? 'admin' : 'user',
    isCreator: context.creator?.status === 'approved',
  };
}
async function mutation<Schema extends z.ZodType, T>(
  raw: unknown,
  schema: Schema,
  auth: 'user' | 'creator',
  handler: (input: z.output<Schema>, principal: Actor) => Promise<{ data: T; tags: string[] }>,
  options: {
    feature?: 'creatorApplicationsOpen' | 'uploadsEnabled';
    rate?: { name: string; limit: number; windowSec: number };
  } = {},
): Promise<ActionResult<T>> {
  const { createAction } = await import('../action');
  return createAction({
    input: schema,
    auth,
    ...(options.feature ? { feature: options.feature } : {}),
    ...(options.rate
      ? {
          rateLimit: {
            key: (ctx: ActionContext<'user' | 'creator'>) => `${options.rate?.name}:${ctx.user.id}`,
            limit: options.rate.limit,
            windowSec: options.rate.windowSec,
          },
        }
      : {}),
    handler: async (input, context) => {
      const result = await handler(input, actor(context));
      if (result.tags.length) (await import('../cache')).invalidate(result.tags, 'update');
      return result.data;
    },
  })(raw);
}
export async function applyForCreator(
  raw: unknown,
): Promise<ActionResult<{ status: CreatorStatus }>> {
  return mutation(
    raw,
    applyForCreatorSchema,
    'user',
    async (input, principal) =>
      (await import('../services/creators')).applyForCreator(input, principal),
    {
      feature: 'creatorApplicationsOpen',
      rate: { name: 'creator-apply', limit: 3, windowSec: 86400 },
    },
  );
}
export async function checkHandle(raw: unknown): Promise<ActionResult<{ available: boolean }>> {
  return mutation(
    raw,
    checkHandleSchema,
    'user',
    async (input, principal) =>
      (await import('../services/creators')).checkHandle(input, principal),
    { rate: { name: 'creator-handle', limit: 120, windowSec: 60 } },
  );
}
export async function updateCreatorProfile(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  return mutation(raw, updateCreatorProfileSchema, 'creator', async (input, principal) =>
    (await import('../services/creators')).updateCreatorProfile(input, principal),
  );
}
export async function createCreatorTheme(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return mutation(
    raw,
    createCreatorThemeSchema,
    'creator',
    async (input, principal) =>
      (await import('../services/creator-themes')).createCreatorTheme(input, principal),
    { rate: { name: 'creator-theme-create', limit: 30, windowSec: 86400 } },
  );
}
export async function updateCreatorTheme(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return mutation(raw, updateCreatorThemeSchema, 'creator', async (input, principal) =>
    (await import('../services/creator-themes')).updateCreatorTheme(input, principal),
  );
}
export async function submitTheme(raw: unknown): Promise<ActionResult<{ status: ThemeStatus }>> {
  return mutation(
    raw,
    creatorThemeIdSchema,
    'creator',
    async (input, principal) =>
      (await import('../services/creator-themes')).submitTheme(input, principal),
    { rate: { name: 'creator-theme-status', limit: 30, windowSec: 86400 } },
  );
}
export async function withdrawTheme(raw: unknown): Promise<ActionResult<{ status: ThemeStatus }>> {
  return mutation(
    raw,
    creatorThemeIdSchema,
    'creator',
    async (input, principal) =>
      (await import('../services/creator-themes')).withdrawTheme(input, principal),
    { rate: { name: 'creator-theme-status', limit: 30, windowSec: 86400 } },
  );
}
export async function deleteCreatorTheme(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return mutation(raw, creatorThemeIdSchema, 'creator', async (input, principal) =>
    (await import('../services/creator-themes')).deleteCreatorTheme(input, principal),
  );
}
