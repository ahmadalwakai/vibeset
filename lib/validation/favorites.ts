import { z } from 'zod';
import { MAX_LOCAL_FAVORITES } from '../favorites';
import { HTTP_STATUS, type ErrorCode } from '../result';
import { actorSchema, themeIdSchema } from '../theme-status';

export const favoriteUserIdSchema = actorSchema.options[0].shape.userId;
export const favoriteThemeIdSchema = themeIdSchema;
export const favoriteIdsSchema = z
  .array(favoriteThemeIdSchema)
  .transform((ids) => [...new Set(ids)]);
export const localFavoriteIdsSchema = z
  .array(favoriteThemeIdSchema)
  .max(MAX_LOCAL_FAVORITES)
  .transform((ids) => [...new Set(ids)]);
export const toggleFavoriteSchema = z.strictObject({ themeId: favoriteThemeIdSchema });
export const mergeLocalFavoritesSchema = z.strictObject({ themeIds: localFavoriteIdsSchema });
export const favoriteIdsResponseSchema = z.strictObject({
  data: z.strictObject({ themeIds: favoriteIdsSchema }),
});
export const favoriteToggleDataSchema = z.strictObject({ favorited: z.boolean() });
export const favoriteMergeDataSchema = z.strictObject({
  merged: z.number().int().nonnegative().max(MAX_LOCAL_FAVORITES),
});
const actionErrorSchema = z.strictObject({
  ok: z.literal(false),
  error: z.object({
    code: z.custom<ErrorCode>(
      (value) => typeof value === 'string' && Object.hasOwn(HTTP_STATUS, value),
    ),
    message: z.string().max(2_000),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
export const favoriteToggleResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), data: favoriteToggleDataSchema }),
  actionErrorSchema,
]);
export const favoriteMergeResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), data: favoriteMergeDataSchema }),
  actionErrorSchema,
]);
