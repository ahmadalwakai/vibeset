import { z } from 'zod';
import type { ErrorCode } from '../result';
import * as boundary from './favorite-boundaries';

// Classic outer schemas preserve server action types and ZodError handling.
// Browser callers import the canonical Mini boundaries directly.
export const favoriteUserIdSchema = z.string().pipe(boundary.favoriteUserIdSchema);
export const favoriteThemeIdSchema = z.string().pipe(boundary.favoriteThemeIdSchema);
export const favoriteIdsSchema = z.array(z.string()).pipe(boundary.favoriteIdsSchema);
export const localFavoriteIdsSchema = z.array(z.string()).pipe(boundary.localFavoriteIdsSchema);
export const toggleFavoriteSchema = z
  .strictObject({ themeId: z.string() })
  .pipe(boundary.toggleFavoriteSchema);
export const mergeLocalFavoritesSchema = z
  .strictObject({ themeIds: z.array(z.string()) })
  .pipe(boundary.mergeLocalFavoritesSchema);
export const favoriteIdsResponseSchema = z
  .strictObject({ data: z.strictObject({ themeIds: z.array(z.string()) }) })
  .pipe(boundary.favoriteIdsResponseSchema);
export const favoriteToggleDataSchema = z
  .strictObject({ favorited: z.boolean() })
  .pipe(boundary.favoriteToggleDataSchema);
export const favoriteMergeDataSchema = z
  .strictObject({ merged: z.number() })
  .pipe(boundary.favoriteMergeDataSchema);

const actionErrorSchema = z
  .strictObject({
    ok: z.literal(false),
    error: z.object({
      code: z.custom<ErrorCode>(
        (value) => boundary.favoriteErrorCodeSchema.safeParse(value).success,
      ),
      message: z.string(),
      fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
    }),
  })
  .pipe(boundary.favoriteActionErrorSchema);

// Keep the classic union at the outer boundary: a second union in a pipe can
// discard the first union's unrecognized-key issues in the installed Zod version.
export const favoriteToggleResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), data: favoriteToggleDataSchema }),
  actionErrorSchema,
]);
export const favoriteMergeResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), data: favoriteMergeDataSchema }),
  actionErrorSchema,
]);
