import { z } from 'zod';
import { APP_CATEGORIES, MAX_ADMIN_COLLECTION_ITEMS } from '../admin-content';
import { themeIdSchema } from '../theme-status';
import { appSlugSchema, glyphNameSchema } from './icon-export';

const label = z
  .string()
  .trim()
  .normalize()
  .min(1)
  .max(120)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));
const nullableLabel = z
  .union([label, z.literal('')])
  .nullish()
  .transform((value) => value || null);
const description = z
  .string()
  .max(4000)
  .transform((value) => value.replace(/\r\n?/g, '\n').trim().normalize())
  .refine((value) => !/[\p{Cf}\p{Cc}]/u.test(value.replaceAll('\n', '')))
  .nullish()
  .transform((value) => value || null);
const order = z.number().int().min(0).max(2_147_483_647);
export const adminContentSlugSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((value) => !/[\s\p{Cc}\p{Cf}]/u.test(value));
const date = z.iso.datetime().nullable().default(null);
export function adminUtcDateInput(value: string): string | null {
  if (!value) return null;
  const raw = `${value}Z`,
    milliseconds = Date.parse(raw);
  return Number.isFinite(milliseconds) && /^\d{4}-/.test(value)
    ? new Date(milliseconds).toISOString()
    : raw;
}
export const adminUpsertCollectionSchema = z
  .strictObject({
    id: themeIdSchema.optional(),
    slug: adminContentSlugSchema.min(2).max(120),
    kind: z.enum(['editorial', 'seasonal']),
    visibility: z.enum(['public', 'private']),
    titleEn: label,
    titleAr: nullableLabel,
    descriptionEn: description,
    descriptionAr: description,
    coverThemeId: themeIdSchema.nullable().default(null),
    isPinned: z.boolean(),
    sortOrder: order,
    startsAt: date,
    endsAt: date,
  })
  .refine(
    (value) =>
      !value.startsAt || !value.endsAt || Date.parse(value.startsAt) < Date.parse(value.endsAt),
    { path: ['endsAt'], message: 'Invalid window' },
  )
  .refine((value) => value.kind === 'seasonal' || (!value.startsAt && !value.endsAt), {
    path: ['startsAt'],
    message: 'Only seasonal collections have a window',
  });
export const adminContentIdSchema = z.strictObject({ id: themeIdSchema });
export const adminSetPinnedSchema = z.strictObject({ id: themeIdSchema, pinned: z.boolean() });
export const adminCollectionItemSchema = z.strictObject({
  collectionId: themeIdSchema,
  themeId: themeIdSchema,
});
export const adminReorderCollectionSchema = z.strictObject({
  collectionId: themeIdSchema,
  themeIds: z
    .array(themeIdSchema)
    .max(MAX_ADMIN_COLLECTION_ITEMS)
    .refine((ids) => new Set(ids).size === ids.length),
});
export const adminContentTagKindSchema = z.enum(['aesthetic', 'mood', 'season', 'style']);
export const adminUpsertTagSchema = z.strictObject({
  id: themeIdSchema.optional(),
  slug: adminContentSlugSchema.min(2).max(40),
  kind: adminContentTagKindSchema,
  nameEn: label,
  nameAr: label,
  descriptionEn: description,
  descriptionAr: description,
  sortOrder: order,
  isActive: z.boolean(),
});
export const adminDeleteTagSchema = z
  .strictObject({
    id: themeIdSchema,
    removeFromThemes: z.boolean().default(false),
    expectedUsageCount: z.number().int().nonnegative().optional(),
  })
  .refine((value) => !value.removeFromThemes || value.expectedUsageCount !== undefined, {
    path: ['expectedUsageCount'],
  });
export const adminMergeTagsSchema = z
  .strictObject({ fromId: themeIdSchema, toId: themeIdSchema })
  .refine((value) => value.fromId !== value.toId, { path: ['toId'] });
const scheme = z
  .string()
  .max(80)
  .regex(/^[a-z][a-z0-9+.-]*:(?:\/\/)?$/)
  .refine(
    (value) =>
      !['javascript', 'data', 'file', 'vbscript', 'http', 'https'].includes(
        value.split(':')[0] ?? '',
      ),
  )
  .nullable()
  .default(null);
export const adminUpsertAppSchema = z.strictObject({
  id: themeIdSchema.optional(),
  slug: appSlugSchema,
  name: label,
  aliases: z
    .array(label)
    .max(20)
    .refine((values) => new Set(values).size === values.length),
  category: z.enum(APP_CATEGORIES),
  glyph: glyphNameSchema,
  iosScheme: scheme,
  androidPackage: z
    .string()
    .max(255)
    .regex(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/)
    .nullable()
    .default(null),
  rank: order,
  isActive: z.boolean(),
});
export const adminReorderAppsSchema = z.strictObject({
  ids: z
    .array(themeIdSchema)
    .max(5000)
    .refine((ids) => new Set(ids).size === ids.length),
});
const page = z.coerce.number().int().min(1).max(100_000).default(1);
const q = z
  .string()
  .trim()
  .max(120)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value))
  .optional();
export const adminCollectionListSchema = z.object({
  page,
  q,
  kind: z.enum(['editorial', 'seasonal']).optional(),
});
export const adminAppListSchema = z.object({ page, q });
export const adminTagListSchema = z.object({ kind: adminContentTagKindSchema.optional() });
export const adminPublishedPickerSchema = z.object({ q, page });
export type AdminUpsertCollectionInput = z.input<typeof adminUpsertCollectionSchema>;
export type AdminUpsertTagInput = z.input<typeof adminUpsertTagSchema>;
export type AdminUpsertAppInput = z.input<typeof adminUpsertAppSchema>;
