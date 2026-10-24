import { z } from 'zod';
import { rejectionReasonSchema, themeIdSchema } from '../theme-status';
import { reviewCreatorSchema } from './creator';

export const adminUserIdSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => !/[\s\p{Cc}\p{Cf}]/u.test(value));
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
const page = z.preprocess(
  (value) => (value === undefined || value === '' ? 1 : value),
  z
    .union([
      z.number(),
      z
        .string()
        .regex(/^[1-9][0-9]{0,5}$/)
        .transform(Number),
    ])
    .pipe(z.number().int().min(1).max(100000)),
);
const q = optional(
  z
    .string()
    .max(256)
    .trim()
    .normalize()
    .min(1)
    .max(120)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value)),
);
const creatorStatus = z.enum(['pending', 'approved', 'rejected', 'suspended']);
export const adminUserQuerySchema = z.strictObject({
  page,
  q,
  role: optional(z.enum(['user', 'admin'])),
  banned: optional(
    z.union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')]),
  ),
  creatorStatus: optional(creatorStatus),
});
export const adminCreatorQuerySchema = z.strictObject({
  page,
  q,
  status: z.enum(['all', 'pending', 'approved', 'rejected', 'suspended']).default('pending'),
});
export const adminReportQuerySchema = z.strictObject({
  page,
  status: z.enum(['open', 'resolved', 'dismissed']).default('open'),
});
export const adminUserReadSchema = z.strictObject({ userId: adminUserIdSchema });
export const adminReportReadSchema = z.strictObject({ id: themeIdSchema });
export const adminSetRoleSchema = z.strictObject({
  userId: adminUserIdSchema,
  role: z.enum(['user', 'admin']),
});
export const adminBanUserSchema = z.strictObject({
  userId: adminUserIdSchema,
  reason: rejectionReasonSchema,
  archiveThemes: z.boolean().default(false),
});
export const adminUnbanUserSchema = adminUserReadSchema;
const note = z
  .string()
  .max(2000)
  .trim()
  .normalize()
  .min(1)
  .max(1000)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value.replaceAll('\n', '').replaceAll('\t', '')));
export const adminResolveReportSchema = z
  .strictObject({
    id: themeIdSchema,
    action: z.enum(['dismiss', 'archive_theme', 'ban_owner']),
    note,
    archiveThemes: z.boolean().default(false),
  })
  .refine((value) => !value.archiveThemes || value.action === 'ban_owner', {
    path: ['archiveThemes'],
  });
export const adminReviewCreatorSchema = reviewCreatorSchema
  .safeExtend({ archiveThemes: z.boolean().default(false) })
  .refine((value) => !value.archiveThemes || value.decision === 'suspend', {
    path: ['archiveThemes'],
  });
export type AdminSetRoleInput = z.output<typeof adminSetRoleSchema>;
export type AdminBanUserInput = z.output<typeof adminBanUserSchema>;
export type AdminResolveReportInput = z.output<typeof adminResolveReportSchema>;
export type AdminReviewCreatorInput = z.output<typeof adminReviewCreatorSchema>;
export type AdminUserQuery = z.output<typeof adminUserQuerySchema>;
export type AdminCreatorQuery = z.output<typeof adminCreatorQuerySchema>;
export type AdminReportQuery = z.output<typeof adminReportQuerySchema>;
