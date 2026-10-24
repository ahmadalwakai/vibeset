import 'server-only';
import type { z } from 'zod';
import type { Actor } from '../lib/theme-status';
import type { ActionResult } from '../lib/result';

export async function adminContentAction<S extends z.ZodType, T>(
  raw: unknown,
  input: S,
  handler: (value: z.output<S>, actor: Actor) => Promise<{ data: T; tags: string[] }>,
): Promise<ActionResult<T>> {
  const { createAction } = await import('./action');
  return createAction({
    input,
    auth: 'admin',
    handler: async (value, { user }) => {
      const result = await handler(value, {
        kind: 'user',
        userId: user.id,
        role: 'admin',
        isCreator: false,
      });
      if (result.tags.length) (await import('./cache')).invalidate(result.tags, 'update');
      return result.data;
    },
  })(raw);
}
