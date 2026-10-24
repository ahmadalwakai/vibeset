import { z } from 'zod';
import { themeIdSchema } from '../theme-status';

const identifiers = z
  .array(themeIdSchema)
  .max(10_000)
  .transform((values) => [...new Set(values)]);
const key = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));
export const maintenanceOptionsSchema = z.strictObject({
  asOf: z.iso
    .datetime()
    .refine((value) => !value.startsWith('0000-'))
    .optional(),
  // Every dimension is required when narrowed: omission can never turn one cleanup global.
  scope: z
    .strictObject({
      themeIds: identifiers,
      uploadIds: identifiers,
      appRateKeys: z
        .array(key)
        .max(10_000)
        .transform((values) => [...new Set(values)]),
      authRateKeys: z
        .array(
          z
            .string()
            .length(64)
            .regex(/^[a-f0-9]+$/),
        )
        .max(10_000)
        .transform((values) => [...new Set(values)]),
    })
    .optional(),
});
