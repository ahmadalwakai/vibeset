import { z } from 'zod';
import type { ThemeSort } from '../dto';
import * as boundaries from '../validation/cursor-boundaries';
import type { CollectionCursor, ThemeCursor } from '../validation/cursor-boundaries';

export type { CollectionCursor, ThemeCursor } from '../validation/cursor-boundaries';

/** Existing server callers rely on the classic error class for validation responses. */
function classicBoundary<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof z.core.$ZodError) throw new z.ZodError(error.issues);
    throw error;
  }
}

export function encodeCursor(value: ThemeCursor): string {
  return classicBoundary(() => boundaries.encodeCursor(value));
}

export function decodeCursor(value: string, sort: ThemeSort): ThemeCursor {
  return classicBoundary(() => boundaries.decodeCursor(value, sort));
}

export function encodeOffsetCursor(offset: number): string {
  return classicBoundary(() => boundaries.encodeOffsetCursor(offset));
}

export function decodeOffsetCursor(value: string): number {
  return classicBoundary(() => boundaries.decodeOffsetCursor(value));
}

export function encodeCollectionCursor(value: Pick<CollectionCursor, 's' | 'id'>): string {
  return classicBoundary(() => boundaries.encodeCollectionCursor(value));
}

export function decodeCollectionCursor(value: string): CollectionCursor {
  return classicBoundary(() => boundaries.decodeCollectionCursor(value));
}
