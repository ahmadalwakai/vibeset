import { z } from 'zod';
import { remixNameSchema } from './remixes';

export const updateAccountSchema = z.strictObject({
  name: remixNameSchema,
  locale: z.enum(['en', 'ar']),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export const accountProfileSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string(),
  email: z.email(),
  locale: z.enum(['en', 'ar']),
});
export const listRemixesSchema = z.strictObject({
  cursor: z.string().min(1).max(1024).optional(),
});
