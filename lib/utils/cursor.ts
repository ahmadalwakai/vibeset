import { z } from 'zod';
import type { ThemeSort } from '../dto';

const id = z.uuid().length(36).toLowerCase();
const timestamp = z.iso.datetime().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/);
const themeCursorSchema = z.discriminatedUnion('k', [
  z.strictObject({ k: z.literal('trending'), s: z.number().finite(), id }),
  z.strictObject({ k: z.literal('popular'), s: z.number().int().nonnegative(), id }),
  z.strictObject({ k: z.literal('new'), s: timestamp, id }),
]);
const offsetSchema = z.strictObject({ o: z.number().int().min(0).max(200) });
const collectionSchema = z.strictObject({ k: z.literal('collection'), s: z.number().int(), id });
export type ThemeCursor = z.infer<typeof themeCursorSchema>;
export type CollectionCursor = z.infer<typeof collectionSchema>;

function encode(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decode(value: string): unknown {
  try {
    const token = z
      .string()
      .min(1)
      .max(1024)
      .regex(/^[A-Za-z0-9_-]+$/)
      .parse(value);
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
