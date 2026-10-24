import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AdminReviewVersionInput } from '../lib/admin-themes';
import { themeStatusSchema } from '../lib/theme-status';

const revisionSchema = z.strictObject({
  status: themeStatusSchema,
  revisionTime: z.iso.datetime({ precision: 6 }),
  specHash: z
    .string()
    .length(64)
    .regex(/^[0-9a-f]{64}$/),
});

export function createAdminReviewVersion(input: AdminReviewVersionInput): string {
  const { status, revisionTime, specHash } = revisionSchema.parse(input);
  return createHash('sha256')
    .update(JSON.stringify([status, revisionTime, specHash]))
    .digest('hex');
}
