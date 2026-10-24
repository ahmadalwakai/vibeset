import * as z from 'zod/mini';
import type { ThemeListQuery } from '../dto';
import { decodeCursor, decodeOffsetCursor, optionalCursorSchema } from './cursor-boundaries';
import { themeIdSchema } from './identifiers';

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
const slug = z.string().check(
  z.minLength(1),
  z.maxLength(160),
  z.regex(/^[a-z0-9][a-z0-9-]*$/),
  z.refine((value) => !/\s/.test(value)),
);
const queryText = z.pipe(
  z.transform((value: unknown) =>
    typeof value === 'string' ? value.trim().normalize('NFC') || undefined : value,
  ),
  z.optional(
    z.string().check(
      z.minLength(2),
      z.maxLength(64),
      z.refine((value) => !/\p{Cc}/u.test(value)),
    ),
  ),
);

function list(entry: z.ZodMiniType<string>, maximum: number): z.ZodMiniType<string[]> {
  return z.pipe(
    z.transform((value: unknown) =>
      typeof value === 'string' && value.length <= 16_384
        ? value.split(',').map((part) => part.trim())
        : value,
    ),
    z
      .pipe(
        z.array(entry).check(z.minLength(1), z.maxLength(100)),
        z.transform((items: string[]) => [...new Set(items)]),
      )
      .check(
        z.refine(
          (items) => items.length <= maximum,
          `At most ${maximum} unique values are allowed`,
        ),
      ),
  );
}

const tagsSchema = z.pipe(
  list(slug, 5),
  z.transform((items: string[]) => items.sort()),
);
const optionalTagsSchema = z.pipe(
  z.transform((value: unknown) =>
    value === '' || (Array.isArray(value) && value.length === 0) ? undefined : value,
  ),
  z.optional(tagsSchema),
);
const idsSchema = list(themeIdSchema, 100);
const limitSchema = z.pipe(
  z.union([
    z.number(),
    z.pipe(
      z.string().check(z.regex(/^\d{1,3}$/)),
      z.transform((value: string) => Number(value)),
    ),
  ]),
  z.int().check(z.minimum(1), z.maximum(48)),
);

export function queryInputRecord(input: unknown): unknown {
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
    ids: z.optional(idsSchema),
    q: queryText,
    tags: optionalTagsSchema,
    color: z.optional(z.enum(COLOR_FAMILIES)),
    sort: z._default(z.enum(THEME_SORTS), 'trending'),
    cursor: optionalCursorSchema,
    limit: z._default(limitSchema, 24),
  })
  .check(
    z.superRefine<ThemeListQuery>((query, context) => {
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
    }),
  );

export const themeListQuerySchema = z.pipe(
  z.transform((input: unknown) => {
    const value = queryInputRecord(input);
    if (typeof value === 'object' && value !== null && 'ids' in value && value.ids !== undefined)
      return { ids: value.ids, sort: 'trending', limit: 24 };
    return value;
  }),
  parsedQuery,
);

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

export function exploreHref(query: ThemeListQuery): string {
  const search = serializeThemeListQuery(query);
  return `/explore${search ? `?${search}` : ''}`;
}

/** Tolerant page navigation only; API/query boundaries use the strict schema above. */
export function normalizeThemeListQuery(input: unknown): ThemeListQuery {
  const strict = themeListQuerySchema.safeParse(input);
  if (strict.success) return strict.data;
  const value = z.record(z.string(), z.unknown()).safeParse(queryInputRecord(input));
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
