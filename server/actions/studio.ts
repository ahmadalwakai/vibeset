'use server';

import type { ActionContext } from '../../lib/auth';
import type { ActionResult } from '../../lib/result';
import type { Actor } from '../../lib/theme-status';
import {
  deleteRemixSchema,
  saveRemixSchema,
  updateRemixSchema,
} from '../../lib/validation/remixes';
import type { RemixData } from '../../lib/validation/remixes';

function actor(context: ActionContext<'user'>): Actor {
  return {
    kind: 'user',
    userId: context.user.id,
    role: context.user.role === 'admin' ? 'admin' : 'user',
    isCreator: false,
  };
}

const remixRateLimit = {
  key: (context: ActionContext<'user'>): string => `studio-remix:${context.user.id}`,
  limit: 30,
  windowSec: 3600,
};

async function resultData(result: { data: RemixData; tags: string[] }): Promise<RemixData> {
  if (result.tags.length) {
    const { invalidate } = await import('../cache');
    invalidate(result.tags, 'update');
  }
  return result.data;
}

export async function saveRemix(raw: unknown): Promise<ActionResult<RemixData>> {
  const { createAction } = await import('../action');
  return createAction({
    input: saveRemixSchema,
    auth: 'user',
    rateLimit: remixRateLimit,
    handler: async (input, context) => {
      const service = await import('../services/remixes');
      return resultData(await service.saveRemix(input, actor(context)));
    },
  })(raw);
}

export async function updateRemix(raw: unknown): Promise<ActionResult<RemixData>> {
  const { createAction } = await import('../action');
  return createAction({
    input: updateRemixSchema,
    auth: 'user',
    rateLimit: remixRateLimit,
    handler: async (input, context) => {
      const service = await import('../services/remixes');
      return resultData(await service.updateRemix(input, actor(context)));
    },
  })(raw);
}

export async function deleteRemix(raw: unknown): Promise<ActionResult<RemixData>> {
  const { createAction } = await import('../action');
  return createAction({
    input: deleteRemixSchema,
    auth: 'user',
    handler: async (input, context) => {
      const service = await import('../services/remixes');
      return resultData(await service.deleteRemix(input, actor(context)));
    },
  })(raw);
}
