import { z } from 'zod';
import { themeSpecSchema } from '../render/spec';
import { rejectionReasonSchema, themeIdSchema, themeStatusSchema } from '../theme-status';
import { decodeCursor } from '../utils/cursor';

const reserved = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'apps',
  'auth',
  'account',
  'accounts',
  'become_creator',
  'billing',
  'blog',
  'brand',
  'brands',
  'collection',
  'collections',
  'contact',
  'copyright',
  'creator',
  'creators',
  'dashboard',
  'download',
  'downloads',
  'edit',
  'explore',
  'faq',
  'help',
  'home',
  'internal',
  'legal',
  'login',
  'logout',
  'me',
  'moderator',
  'new',
  'official',
  'privacy',
  'profile',
  'register',
  'report',
  'reports',
  'root',
  'saved',
  'search',
  'security',
  'settings',
  'setup',
  'signin',
  'signup',
  'staff',
  'static',
  'status',
  'studio',
  'support',
  'system',
  'terms',
  'theme',
  'themes',
  'upload',
  'uploads',
  'user',
  'users',
  'vibeset',
  'www',
  'apple',
  'google',
  'facebook',
  'instagram',
  'tiktok',
  'twitter',
  'x',
  'youtube',
]);
export const creatorHandleSchema = z
  .string()
  .min(3)
  .max(24)
  .regex(/^[a-z0-9_]+$/)
  .refine((value) => !/[\s\p{Cc}\p{Cf}]/u.test(value), 'Invalid handle')
  .refine((value) => !reserved.has(value), 'Reserved handle');
const text = (max: number) =>
  z
    .string()
    .trim()
    .normalize()
    .max(max)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));
const requiredName = text(60).min(1);
const multiline = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(/\r\n?/g, '\n').trim().normalize())
    .pipe(
      z
        .string()
        .max(max)
        .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value.replaceAll('\n', ''))),
    );
export const creatorLinkSchema = z.strictObject({
  label: text(80).min(1),
  url: z
    .url({ protocol: /^https$/ })
    .max(2048)
    .refine((value) => {
      const parsed = new URL(value);
      return !parsed.username && !parsed.password && !/[\s\p{Cc}\p{Cf}]/u.test(value);
    }),
});
const profileFields = {
  displayName: requiredName,
  bio: multiline(280).optional(),
  links: z.array(creatorLinkSchema).max(3),
};
export const applyForCreatorSchema = z.strictObject({
  ...profileFields,
  handle: creatorHandleSchema,
  isAdult: z.literal(true),
});
export const checkHandleSchema = z.strictObject({ handle: creatorHandleSchema });
export const updateCreatorProfileSchema = z.strictObject({
  ...profileFields,
  avatarUploadId: themeIdSchema.optional(),
});
export const reviewCreatorSchema = z
  .strictObject({
    userId: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => !/[\s\p{Cc}\p{Cf}]/u.test(value)),
    decision: z.enum(['approve', 'reject', 'suspend']),
    reason: rejectionReasonSchema.optional(),
  })
  .refine((value) => value.decision === 'approve' || !!value.reason, {
    path: ['reason'],
    message: 'A reason is required',
  });
export const creatorThemeFields = {
  spec: themeSpecSchema,
  nameEn: requiredName,
  nameAr: text(60).optional(),
  descriptionEn: multiline(2000).optional(),
  descriptionAr: multiline(2000).optional(),
  tagSlugs: z
    .array(
      z
        .string()
        .min(2)
        .max(40)
        .regex(/^[a-z0-9-]+$/)
        .refine((value) => !/[\s\p{Cc}\p{Cf}]/u.test(value)),
    )
    .min(1)
    .max(6)
    .refine((value) => new Set(value).size === value.length),
};
export const createCreatorThemeSchema = z.strictObject(creatorThemeFields);
export const updateCreatorThemeSchema = z.strictObject({
  id: themeIdSchema,
  ...creatorThemeFields,
});
export const creatorThemeIdSchema = z.strictObject({ id: themeIdSchema });
export const listCreatorThemesSchema = z.strictObject({
  status: themeStatusSchema.optional(),
  cursor: z
    .string()
    .max(1024)
    .refine((value) => {
      try {
        decodeCursor(value, 'new');
        return true;
      } catch {
        return false;
      }
    })
    .optional(),
});
export const creatorDashboardSchema = z.strictObject({
  days: z.union([z.literal(7), z.literal(30)]).default(7),
});
export type ApplyForCreatorInput = z.infer<typeof applyForCreatorSchema>;
export type UpdateCreatorProfileInput = z.infer<typeof updateCreatorProfileSchema>;
export type ReviewCreatorInput = z.infer<typeof reviewCreatorSchema>;
export type CreateCreatorThemeInput = z.infer<typeof createCreatorThemeSchema>;
export type UpdateCreatorThemeInput = z.infer<typeof updateCreatorThemeSchema>;
