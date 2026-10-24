'use server';

import type { ActionResult } from '../../lib/result';
import { updateAccountSchema } from '../../lib/validation/account';

export async function updateAccount(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  const { createAction } = await import('../action');
  return createAction({
    input: updateAccountSchema,
    auth: 'user',
    handler: async (input, context) => {
      const { updateAccount: service } = await import('../services/account');
      return (
        await service(input, {
          kind: 'user',
          userId: context.user.id,
          role: context.user.role === 'admin' ? 'admin' : 'user',
          isCreator: false,
        })
      ).data;
    },
  })(raw);
}
