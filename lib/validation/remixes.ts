import { z } from 'zod';
import { themeSpecSchema } from '../render/spec';
import { themeIdSchema } from '../theme-status';

export const remixNameSchema = z
  .string()
  .trim()
  .normalize()
  .min(1)
  .max(60)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));
export const remixSourceSlugSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .refine((value) => !/\s/.test(value));

export const saveRemixSchema = z.strictObject({
  spec: themeSpecSchema,
  nameEn: remixNameSchema,
  remixOfSlug: remixSourceSlugSchema.optional(),
});
export const updateRemixSchema = z.strictObject({
  id: themeIdSchema,
  spec: themeSpecSchema,
  nameEn: remixNameSchema,
});
export const deleteRemixSchema = z.strictObject({ id: themeIdSchema });
export const remixDataSchema = z.strictObject({ id: themeIdSchema });

export type SaveRemixInput = z.infer<typeof saveRemixSchema>;
export type UpdateRemixInput = z.infer<typeof updateRemixSchema>;
export type DeleteRemixInput = z.infer<typeof deleteRemixSchema>;
export type RemixData = z.infer<typeof remixDataSchema>;
