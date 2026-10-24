import { z } from 'zod';
import { themeSpecSchema } from '../render/spec';
import type { SavedRemix } from '../account';

export const savedRemixSchema: z.ZodType<SavedRemix> = z.strictObject({
  id: z.uuid().toLowerCase(),
  nameEn: z.string(),
  spec: themeSpecSchema,
  updatedAt: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
});
export const savedRemixesPageSchema = z.strictObject({
  items: z.array(savedRemixSchema).max(48),
  nextCursor: z.string().nullable(),
});
