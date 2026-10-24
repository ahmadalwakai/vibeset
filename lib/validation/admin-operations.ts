import { z } from 'zod';
import { settingSchemas } from '../settings';
import { themeIdSchema } from '../theme-status';

const page = z.preprocess(
  (value) => (value === undefined || value === '' ? 1 : value),
  z
    .union([
      z.number(),
      z
        .string()
        .max(6)
        .regex(/^[1-9][0-9]*$/)
        .transform(Number),
    ])
    .pipe(z.number().int().min(1).max(100_000)),
);
const text = z
  .string()
  .trim()
  .normalize()
  .min(1)
  .max(256)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));
const optionalText = z.preprocess((value) => (value === '' ? undefined : value), text.optional());
const optionalDate = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.iso.date().optional(),
);
export const adminGenerateDraftsSchema = z.strictObject({
  aesthetic: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/)
    .refine((value) => !/\s/.test(value)),
  count: z.number().int().min(1).max(24),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
});
export const adminUpdateSettingSchema = z.discriminatedUnion('key', [
  z.strictObject({ key: z.literal('home.hero'), value: settingSchemas['home.hero'] }),
  z.strictObject({
    key: z.literal('home.announcement'),
    value: settingSchemas['home.announcement'],
  }),
  z.strictObject({ key: z.literal('features'), value: settingSchemas.features }),
]);
export const adminGenerationQuerySchema = z.strictObject({
  page,
  aesthetic: z.preprocess(
    (value) => (value === '' ? undefined : value),
    adminGenerateDraftsSchema.shape.aesthetic.optional(),
  ),
});
export const adminGenerationReadSchema = z.strictObject({ id: themeIdSchema });
export const adminAuditQuerySchema = z
  .strictObject({
    page,
    actor: optionalText,
    action: optionalText,
    entityType: optionalText,
    entityId: optionalText,
    from: optionalDate,
    to: optionalDate,
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    error: 'Date range must be ordered',
  });
export type AdminGenerateDraftsInput = z.output<typeof adminGenerateDraftsSchema>;
export type AdminUpdateSettingInput = z.output<typeof adminUpdateSettingSchema>;
export type AdminGenerationQuery = z.output<typeof adminGenerationQuerySchema>;
export type AdminAuditQuery = z.output<typeof adminAuditQuerySchema>;
