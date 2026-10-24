import { z } from 'zod';
import { ADMIN_BULK_TARGETS } from '../admin-themes';
import { themeIdSchema, rejectionReasonSchema } from '../theme-status';
import { creatorThemeFields } from './creator';

export const adminTransitionTargetSchema = z.enum(ADMIN_BULK_TARGETS);
export const adminReviewVersionSchema = z
  .string()
  .length(64)
  .regex(/^[0-9a-f]{64}$/);
export const adminThemeIdsSchema = z
  .array(themeIdSchema)
  .min(1)
  .max(100)
  .transform((ids) => [...new Set(ids)]);
export const adminTagSlugSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9-]+$/)
  .refine((value) => !/[\s\p{Cc}\p{Cf}]/u.test(value));
const slugs = z
  .array(adminTagSlugSchema)
  .max(100)
  .refine((values) => new Set(values).size === values.length);
export const adminUpdateThemeSchema = z.strictObject({
  id: themeIdSchema,
  nameEn: creatorThemeFields.nameEn,
  nameAr: creatorThemeFields.nameAr,
  descriptionEn: creatorThemeFields.descriptionEn,
  descriptionAr: creatorThemeFields.descriptionAr,
  tagSlugs: slugs.min(1),
  spec: creatorThemeFields.spec.optional(),
  isFeatured: z.boolean(),
});
export const adminTransitionThemesSchema = z
  .strictObject({
    ids: adminThemeIdsSchema,
    to: adminTransitionTargetSchema,
    reason: rejectionReasonSchema.optional(),
    reviewVersion: adminReviewVersionSchema.optional(),
  })
  .refine((value) => value.to !== 'rejected' || !!value.reason, {
    path: ['reason'],
    message: 'A rejection reason is required',
  })
  .refine((value) => value.reviewVersion === undefined || value.ids.length === 1, {
    path: ['reviewVersion'],
    message: 'A review version requires exactly one theme',
  });
export const adminSetFeaturedSchema = z.strictObject({
  ids: adminThemeIdsSchema,
  featured: z.boolean(),
});
export const adminTagThemesSchema = z
  .strictObject({ ids: adminThemeIdsSchema, add: slugs, remove: slugs })
  .refine((value) => !value.add.some((slug) => value.remove.includes(slug)), {
    path: ['add'],
    message: 'Cannot add and remove the same tag',
  });
export const adminAddToCollectionSchema = z.strictObject({
  ids: adminThemeIdsSchema,
  collectionId: themeIdSchema,
});
export const adminDeleteThemesSchema = z.strictObject({ ids: adminThemeIdsSchema });
export type AdminUpdateThemeInput = z.infer<typeof adminUpdateThemeSchema>;
export type AdminTransitionThemesInput = z.infer<typeof adminTransitionThemesSchema>;
export type AdminSetFeaturedInput = z.infer<typeof adminSetFeaturedSchema>;
export type AdminTagThemesInput = z.infer<typeof adminTagThemesSchema>;
export type AdminAddToCollectionInput = z.infer<typeof adminAddToCollectionSchema>;
export type AdminDeleteThemesInput = z.infer<typeof adminDeleteThemesSchema>;
