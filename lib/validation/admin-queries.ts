import { z } from 'zod';
import { themeIdSchema, themeSourceSchema, themeStatusSchema } from '../theme-status';

export const ADMIN_THEME_SORTS = ['updated', 'published', 'popularity', 'downloads'] as const;
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    schema.optional(),
  );
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
    .pipe(z.number().int().min(1).max(100_000)),
);
const boolean = optional(
  z.union([
    z.boolean(),
    z.enum(['true', 'false', '1', '0']).transform((value) => value === 'true' || value === '1'),
  ]),
);
const slug = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9-]+$/)
  .refine((value) => !/\s/.test(value));
const queryText = z
  .string()
  .max(256)
  .trim()
  .normalize()
  .min(1)
  .max(120)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));
const color = z.enum([
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
]);
export const adminThemeListSchema = z.strictObject({
  page,
  status: optional(themeStatusSchema),
  source: optional(themeSourceSchema),
  aesthetic: optional(slug),
  color: optional(color),
  featured: boolean,
  stale: boolean,
  run: optional(themeIdSchema),
  q: optional(queryText),
  sort: z.enum(ADMIN_THEME_SORTS).default('updated'),
});
const cursorPayload = z.strictObject({
  k: z.literal('admin-review'),
  priority: z.union([z.literal(0), z.literal(1)]),
  at: z.iso.datetime().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  id: themeIdSchema,
});
export type AdminReviewCursor = z.output<typeof cursorPayload>;

export function encodeAdminReviewCursor(input: AdminReviewCursor): string {
  return btoa(JSON.stringify(cursorPayload.parse(input)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
export function decodeAdminReviewCursor(input: string): AdminReviewCursor {
  try {
    const token = z
      .string()
      .min(1)
      .max(1024)
      .regex(/^[A-Za-z0-9_-]+$/)
      .parse(input);
    const binary = atob(token.replaceAll('-', '+').replaceAll('_', '/'));
    if (btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== token)
      return z.never().parse(input);
    return cursorPayload.parse(JSON.parse(binary));
  } catch {
    return z.never().parse(input);
  }
}
const cursor = optional(
  z
    .string()
    .max(1024)
    .refine((value) => {
      try {
        decodeAdminReviewCursor(value);
        return true;
      } catch {
        return false;
      }
    }, 'Invalid review cursor'),
);
export const adminReviewQuerySchema = z.strictObject({
  page,
  aesthetic: optional(slug),
  run: optional(themeIdSchema),
  cursor,
});
export const adminPublishQuerySchema = z.strictObject({
  page,
  kind: z.enum(['all', 'approved', 'stale', 'archived', 'failed']).default('all'),
});
export const adminThemeReadSchema = z.strictObject({ id: themeIdSchema });
export type AdminThemeListQuery = z.output<typeof adminThemeListSchema>;
export type AdminReviewQuery = z.output<typeof adminReviewQuerySchema>;
export type AdminPublishQuery = z.output<typeof adminPublishQuerySchema>;

/** URLSearchParams are handled explicitly; duplicate scalar values are rejected. */
export function adminQueryInput(value: unknown): unknown {
  if (!(value instanceof URLSearchParams)) return value;
  const entries: [string, string][] = [];
  const keys = new Set<string>();
  for (const [key, entry] of value) {
    if (keys.has(key)) throw new Error('Duplicate admin query parameter');
    keys.add(key);
    entries.push([key, entry]);
  }
  return Object.fromEntries(entries);
}
