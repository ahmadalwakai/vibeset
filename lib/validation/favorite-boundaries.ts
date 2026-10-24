import * as z from 'zod/mini';
import { MAX_LOCAL_FAVORITES } from '../favorites';
import { HTTP_STATUS, type ErrorCode } from '../result';
import { actorIdSchema, themeIdSchema } from './identifiers';

export const favoriteUserIdSchema = actorIdSchema;
export const favoriteThemeIdSchema = themeIdSchema;

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export const favoriteIdsSchema = z.pipe(z.array(favoriteThemeIdSchema), z.transform(uniqueIds));
export const localFavoriteIdsSchema = z.pipe(
  z.array(favoriteThemeIdSchema).check(z.maxLength(MAX_LOCAL_FAVORITES)),
  z.transform(uniqueIds),
);
export const toggleFavoriteSchema = z.strictObject({ themeId: favoriteThemeIdSchema });
export const mergeLocalFavoritesSchema = z.strictObject({ themeIds: localFavoriteIdsSchema });
export const favoriteIdsResponseSchema = z.strictObject({
  data: z.strictObject({ themeIds: favoriteIdsSchema }),
});
export const favoriteToggleDataSchema = z.strictObject({ favorited: z.boolean() });
export const favoriteMergeDataSchema = z.strictObject({
  merged: z.int().check(z.nonnegative(), z.lte(MAX_LOCAL_FAVORITES)),
});
export const favoriteErrorCodeSchema = z.custom<ErrorCode>(
  (value) => typeof value === 'string' && Object.hasOwn(HTTP_STATUS, value),
);
export const favoriteActionErrorSchema = z.strictObject({
  ok: z.literal(false),
  error: z.object({
    code: favoriteErrorCodeSchema,
    message: z.string().check(z.maxLength(2_000)),
    fieldErrors: z.optional(z.record(z.string(), z.array(z.string()))),
  }),
});
export const favoriteToggleResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), data: favoriteToggleDataSchema }),
  favoriteActionErrorSchema,
]);
export const favoriteMergeResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), data: favoriteMergeDataSchema }),
  favoriteActionErrorSchema,
]);
