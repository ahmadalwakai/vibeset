import * as z from 'zod/mini';
import type { ThemeSort } from '../dto';
import { themeIdSchema } from './identifiers';

const timestamp = z.iso
  .datetime()
  .check(z.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/));
const themeCursorSchema = z.discriminatedUnion('k', [
  z.strictObject({ k: z.literal('trending'), s: z.number(), id: themeIdSchema }),
  z.strictObject({ k: z.literal('popular'), s: z.int().check(z.nonnegative()), id: themeIdSchema }),
  z.strictObject({ k: z.literal('new'), s: timestamp, id: themeIdSchema }),
]);
const offsetSchema = z.strictObject({ o: z.int().check(z.minimum(0), z.maximum(200)) });
const collectionSchema = z.strictObject({
  k: z.literal('collection'),
  s: z.int(),
  id: themeIdSchema,
});
const tokenSchema = z
  .string()
  .check(z.minLength(1), z.maxLength(1024), z.regex(/^[A-Za-z0-9_-]+$/));

export type ThemeCursor = z.infer<typeof themeCursorSchema>;
export type CollectionCursor = z.infer<typeof collectionSchema>;

function encode(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decode(value: string): unknown {
  try {
    const token = tokenSchema.parse(value);
    const binary = atob(token.replaceAll('-', '+').replaceAll('_', '/'));
    if (btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== token)
      return z.never().parse(value);
    return JSON.parse(binary);
  } catch {
    return z.never().parse(value);
  }
}

export function encodeCursor(value: ThemeCursor): string {
  return encode(themeCursorSchema.parse(value));
}

export function decodeCursor(value: string, sort: ThemeSort): ThemeCursor {
  const cursor = themeCursorSchema.parse(decode(value));
  if (cursor.k !== sort) return z.never().parse(value);
  return cursor;
}

export function encodeOffsetCursor(offset: number): string {
  return encode(offsetSchema.parse({ o: offset }));
}

export function decodeOffsetCursor(value: string): number {
  return offsetSchema.parse(decode(value)).o;
}

export function encodeCollectionCursor(value: Pick<CollectionCursor, 's' | 'id'>): string {
  return encode(collectionSchema.parse({ ...value, k: 'collection' }));
}

export function decodeCollectionCursor(value: string): CollectionCursor {
  return collectionSchema.parse(decode(value));
}

export const optionalCursorSchema = z.optional(
  z.nullable(z.string().check(z.minLength(1), z.maxLength(1024))),
);
export const collectionCursorSchema = optionalCursorSchema.check(
  z.superRefine((value, context) => {
    if (!value) return;
    try {
      decodeCollectionCursor(value);
    } catch {
      context.addIssue({ code: 'custom', message: 'Invalid collection cursor' });
    }
  }),
);
