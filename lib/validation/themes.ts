import { z } from 'zod';
import type { Paginated, ThemeCardDTO, ThemeListQuery } from '../dto';
import { HTTP_STATUS } from '../result';
import { collectionCursorSchema as miniCollectionCursorSchema } from './cursor-boundaries';
import {
  themeListQuerySchema as miniThemeListQuerySchema,
  normalizeThemeListQuery as normalizeMiniThemeListQuery,
  serializeThemeListQuery as serializeMiniThemeListQuery,
  queryInputRecord,
} from './theme-query';

export { COLOR_FAMILIES, THEME_SORTS } from './theme-query';

// Server routes retain classic Zod errors while sharing the client's canonical rules.
export const themeListQuerySchema = z.unknown().pipe(miniThemeListQuerySchema);

export function serializeThemeListQuery(input: ThemeListQuery): string {
  return serializeMiniThemeListQuery(themeListQuerySchema.parse(input));
}

export function themeQueryKey(query: ThemeListQuery): string {
  return serializeThemeListQuery(query);
}

export function normalizeThemeListQuery(input: unknown): ThemeListQuery {
  return normalizeMiniThemeListQuery(input);
}

const slug = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .refine((value) => !/\s/.test(value));
const uuid = z.uuid().length(36).toLowerCase();
const httpUrl = z.url({ protocol: /^https?$/ });
export const tagSchema = z.object({
  slug,
  kind: z.enum(['aesthetic', 'mood', 'season', 'style']),
  nameEn: z.string(),
  nameAr: z.string(),
});
export const themeCardSchema: z.ZodType<ThemeCardDTO> = z.object({
  id: uuid,
  slug,
  nameEn: z.string(),
  nameAr: z.string().nullable(),
  thumbUrl: httpUrl.nullable(),
  dominantColor: z
    .string()
    .regex(/^#[a-f0-9]{6}$/i)
    .nullable(),
  tags: z.array(tagSchema).max(100),
  isFeatured: z.boolean(),
  downloadCount: z.number().int().nonnegative(),
  favoriteCount: z.number().int().nonnegative(),
  creator: z
    .object({ handle: z.string(), displayName: z.string(), avatarUrl: httpUrl.nullable() })
    .nullable(),
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
});
export const themePageSchema: z.ZodType<Paginated<ThemeCardDTO>> = z.object({
  items: z.array(themeCardSchema).max(100),
  nextCursor: z.string().min(1).max(1024).nullable(),
});
export const themePageResponseSchema = z.object({ data: themePageSchema });
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.custom<keyof typeof HTTP_STATUS>(
      (code) => typeof code === 'string' && Object.hasOwn(HTTP_STATUS, code),
    ),
  }),
});

export const aestheticSlugSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9-]+$/)
  .refine((value) => !/\s/.test(value));
export const collectionSlugSchema = z
  .string()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9-]+$/)
  .refine((value) => !/\s/.test(value));
export const creatorHandleSchema = z
  .string()
  .min(3)
  .max(24)
  .regex(/^[a-z0-9_]+$/)
  .refine((value) => !/\s/.test(value));
export const collectionCursorSchema = z
  .string()
  .nullable()
  .optional()
  .pipe(miniCollectionCursorSchema)
  .optional();
export function parseCollectionPageQuery(input: unknown): { cursor?: string | null } {
  return z.preprocess(queryInputRecord, z.object({ cursor: collectionCursorSchema })).parse(input);
}
