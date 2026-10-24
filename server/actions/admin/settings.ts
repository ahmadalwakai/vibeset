'use server';

import type { ActionResult } from '../../../lib/result';
import { adminUpdateSettingSchema } from '../../../lib/validation/admin-operations';

export async function adminUpdateSetting(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  const { createAction } = await import('../../action');
  return createAction({
    input: adminUpdateSettingSchema,
    auth: 'admin',
    handler: async (input, context) => {
      const { updateSetting } = await import('../../services/settings');
      const result = await updateSetting(input.key, input.value, {
        kind: 'user',
        userId: context.user.id,
        role: 'admin',
        isCreator: false,
      });
      (await import('../../cache')).invalidate(result.tags, 'update');
      return result.data;
    },
  })(raw);
}
