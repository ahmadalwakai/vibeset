import { z } from 'zod';
import type { Paginated, ThemeCardDTO, ThemeListQuery } from '../dto';
import { HTTP_STATUS } from '../result';
import { decodeCollectionCursor, decodeCursor, decodeOffsetCursor } from '../utils/cursor';

export const COLOR_FAMILIES = [
  'pink',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'brown',
  'black',
  'white',
  'gray',
  'multi',
] as const;
export const THEME_SORTS = ['trending', 'new', 'popular'] as const;
const slug = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .refine((value) => !/\s/.test(value));
const uuid = z.uuid().length(36).toLowerCase();
const queryText = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().normalize('NFC') || undefined : value),
  z
    .string()
    .min(2)
    .max(64)
    .refine((value) => !/\p{Cc}/u.test(value))
    .optional(),
);
const list = (entry: z.ZodType<string>, maximum: number): z.ZodType<string[]> =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.length <= 16_384
        ? value.split(',').map((part) => part.trim())
        : value,
    z
      .array(entry)
      .min(1)
      .max(100)
      .transform((items) => [...new Set(items)])
      .refine((items) => items.length <= maximum, `At most ${maximum} unique values are allowed`),
  );
const tagsSchema = list(slug, 5).transform((items) => items.sort());
const optionalTagsSchema = z.preprocess(
  (value) => (value === '' || (Array.isArray(value) && value.length === 0) ? undefined : value),
  tagsSchema.optional(),
);
const idsSchema = list(uuid, 100);
const limitSchema = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^\d{1,3}$/)
      .transform(Number),
  ])
  .pipe(z.number().int().min(1).max(48));
const cursorSchema = z.string().min(1).max(1024).nullable().optional();

function record(input: unknown): unknown {
  if (input instanceof URLSearchParams) {
    return Object.fromEntries(
      [...new Set(input.keys())].map((key) => {
        const values = input.getAll(key);
        return [key, values.length === 1 ? values[0] : values];
      }),
    );
  }
  return input;
}

const parsedQuery = z
  .object({
    ids: idsSchema.optional(),
    q: queryText,
    tags: optionalTagsSchema,
    color: z.enum(COLOR_FAMILIES).optional(),
    sort: z.enum(THEME_SORTS).default('trending'),
    cursor: cursorSchema,
    limit: limitSchema.default(24),
  })
  .superRefine((query, context) => {
    if (!query.cursor) return;
    try {
      if (query.q) decodeOffsetCursor(query.cursor);
      else decodeCursor(query.cursor, query.sort);
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['cursor'],
        message: 'Invalid or incompatible cursor',
      });
    }
  });

export const themeListQuerySchema = z.preprocess((input) => {
  const value = record(input);
  if (typeof value === 'object' && value !== null && 'ids' in value && value.ids !== undefined)
    return { ids: value.ids, sort: 'trending', limit: 24 };
  return value;
}, parsedQuery);

export function serializeThemeListQuery(input: ThemeListQuery): string {
  const query = themeListQuerySchema.parse(input);
  const params = new URLSearchParams();
  if (query.ids) params.set('ids', query.ids.join(','));
  else {
    if (query.q) params.set('q', query.q);
    if (query.tags?.length) params.set('tags', query.tags.join(','));
    if (query.color) params.set('color', query.color);
    if (query.sort !== 'trending') params.set('sort', query.sort);
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.limit !== 24) params.set('limit', String(query.limit));
  }
  return params.toString();
}

export function themeQueryKey(query: ThemeListQuery): string {
  return serializeThemeListQuery(query);
}

/** Tolerant page navigation only; API/query boundaries use the strict schema above. */
export function normalizeThemeListQuery(input: unknown): ThemeListQuery {
  const strict = themeListQuerySchema.safeParse(input);
  if (strict.success) return strict.data;
  const raw = record(input);
  const value = z.record(z.string(), z.unknown()).safeParse(raw);
  if (!value.success) return { sort: 'trending', limit: 24 };
  const source = value.data;
  const q = queryText.safeParse(source.q);
  const tags = optionalTagsSchema.safeParse(source.tags);
  const color = z.enum(COLOR_FAMILIES).safeParse(source.color);
  const sort = z.enum(THEME_SORTS).safeParse(source.sort);
  const limit = limitSchema.safeParse(source.limit);
  return themeListQuerySchema.parse({
    q: q.success ? q.data : undefined,
    tags: tags.success ? tags.data : undefined,
    color: color.success ? color.data : undefined,
    sort: sort.success ? sort.data : 'trending',
    limit: limit.success ? limit.data : 24,
  });
}

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
export const collectionCursorSchema = cursorSchema.superRefine((value, context) => {
  if (!value) return;
  try {
    decodeCollectionCursor(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Invalid collection cursor' });
  }
});
export function parseCollectionPageQuery(input: unknown): { cursor?: string | null } {
  return z.preprocess(record, z.object({ cursor: collectionCursorSchema })).parse(input);
}
