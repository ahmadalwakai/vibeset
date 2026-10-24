import { z } from 'zod';
import { MAX_COLLECTION_ITEMS } from '../collections';
import { themeIdSchema } from '../theme-status';

export const collectionTitleSchema = z
  .string()
  .trim()
  .normalize()
  .min(1)
  .max(60)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));
export const userCollectionVisibilitySchema = z.enum(['private', 'unlisted']);
export const createCollectionSchema = z.strictObject({
  titleEn: collectionTitleSchema,
  visibility: userCollectionVisibilitySchema,
});
export const updateCollectionSchema = z
  .strictObject({
    id: themeIdSchema,
    titleEn: collectionTitleSchema.optional(),
    visibility: userCollectionVisibilitySchema.optional(),
  })
  .refine((value) => value.titleEn !== undefined || value.visibility !== undefined);
export const deleteCollectionSchema = z.strictObject({ id: themeIdSchema });
export const collectionItemSchema = z.strictObject({
  collectionId: themeIdSchema,
  themeId: themeIdSchema,
});
export const reorderCollectionSchema = z.strictObject({
  collectionId: themeIdSchema,
  themeIds: z
    .array(themeIdSchema)
    .max(MAX_COLLECTION_ITEMS)
    .refine((values) => new Set(values).size === values.length),
});
export const listCollectionsSchema = z.strictObject({ themeId: themeIdSchema.optional() });

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
export type DeleteCollectionInput = z.infer<typeof deleteCollectionSchema>;
export type CollectionItemInput = z.infer<typeof collectionItemSchema>;
export type ReorderCollectionInput = z.infer<typeof reorderCollectionSchema>;
