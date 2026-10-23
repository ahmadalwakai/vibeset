import { z } from 'zod';

export const THEME_STATUSES = [
  'draft',
  'pending_review',
  'approved',
  'published',
  'rejected',
  'archived',
] as const;
export const themeStatusSchema = z.enum(THEME_STATUSES);
export const themeSourceSchema = z.enum(['generated', 'admin', 'creator', 'remix']);
export type ThemeStatus = z.infer<typeof themeStatusSchema>;
export type ThemeSource = z.infer<typeof themeSourceSchema>;
export const themeIdSchema = z.uuid().length(36).toLowerCase();

const actorId = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[^\s\u0000-\u001f\u007f]+$/);
export const actorSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('user'),
    userId: actorId,
    role: z.enum(['user', 'admin']),
    isCreator: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('system'),
    label: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._: -]*$/),
  }),
]);
export type Actor = z.infer<typeof actorSchema>;

export const rejectionReasonSchema = z
  .string()
  .max(2_000)
  .transform((value) =>
    value
      .replace(/<[^>]*>/g, '')
      .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  .pipe(z.string().min(1).max(500));

export const transitionThemeSchema = z.object({
  id: themeIdSchema,
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .refine((value) => !/[\s\p{Cc}\p{Cf}]/u.test(value)),
  status: themeStatusSchema,
  source: themeSourceSchema,
  ownerId: actorId.nullable(),
  nameEn: z.string(),
  spec: z.unknown(),
  specHash: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  assetVersion: z.number().int().nonnegative(),
  aestheticTagCount: z.number().int().nonnegative().optional(),
});
export type TransitionTheme = z.infer<typeof transitionThemeSchema>;
export type ThemeTransitionData = { id: string; status: ThemeStatus };

export interface TransitionRule {
  from: ThemeStatus;
  to: ThemeStatus;
  permission: 'ownerCreator' | 'owner' | 'admin';
}

export const TRANSITIONS = [
  { from: 'draft', to: 'pending_review', permission: 'ownerCreator' },
  { from: 'draft', to: 'approved', permission: 'admin' },
  { from: 'pending_review', to: 'draft', permission: 'owner' },
  { from: 'pending_review', to: 'approved', permission: 'admin' },
  { from: 'pending_review', to: 'rejected', permission: 'admin' },
  { from: 'approved', to: 'rejected', permission: 'admin' },
  { from: 'approved', to: 'published', permission: 'admin' },
  { from: 'rejected', to: 'draft', permission: 'owner' },
  { from: 'rejected', to: 'approved', permission: 'admin' },
  { from: 'published', to: 'archived', permission: 'admin' },
  { from: 'archived', to: 'published', permission: 'admin' },
] as const satisfies readonly TransitionRule[];
